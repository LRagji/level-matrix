module.exports = class Matrix {

    #MaxKeySize = 2n ** 64n - 1n; //This is a signed 64bit integer
    #MinimumIndexPerDimension = 0n;
    #MaximumIndexPerDimension;
    #partitionHeight;
    #partitionWidth;
    #leveldbFactory;
    #convertCoordinatesToSortedQueries;
    #convertCoordinatesToOptimizedQueries;
    #dimensions = new Map();
    #options = { keyEncoding: 'binary', valueEncoding: 'json' };
    #sectionResolver = (cordinates) => { throw new Error("Dimensions not configured corectly."); };
    #dimensionForLoop;
    #dataRead;
    #addressToAbsoluteCoordinates;

    //We are using Map for dimensions cause it retains insertion order of the keys which helps us define which dimension will have be first for Row-Major-Order
    constructor(leveldbResolver, dimensions = new Map([['x', 10], ['y', 10]])) {

        this.batchPut = this.batchPut.bind(this);
        this.rangeRead = this.rangeRead.bind(this);

        this.#dimensionForLoop = this.dimensionForLoop.bind(this);
        this.#dataRead = this.dataRead.bind(this);
        this.#convertCoordinatesToSortedQueries = this.convertCoordinatesToSortedQueries.bind(this);
        this.#convertCoordinatesToOptimizedQueries = this.convertCoordinatesToOptimizedQueries.bind(this);
        this.#addressToAbsoluteCoordinates = this.addressToAbsoluteCoordinates.bind(this);

        if (leveldbResolver == null) throw new Error(`Parameter "leveldbResolver", cannot be null.`);
        if (dimensions.size === 0) throw new Error(`Parameter "dimensions", cannot be empty.`);

        this.#MaximumIndexPerDimension = this.#MaxKeySize / BigInt(dimensions.size);
        dimensions.forEach((maximumLength, dimensionName) => {
            if (BigInt(maximumLength) > this.#MaximumIndexPerDimension) throw new Error(`Parameter "dimensions", has an invalid dimension length for "${dimensionName}" which should not exceed ${this.#MaximumIndexPerDimension}.`)
            this.#dimensions.set(dimensionName, BigInt(maximumLength));
        });

        this.#leveldbFactory = leveldbResolver;
        this.#sectionResolver = (cordinates) => {
            if (cordinates.size !== dimensions.size) throw new Error(`Cannot calculate address: cordinates should match dimensions length ${dimensions.size}.`);
            let address = 0n;
            let dimensionFactor = 1n;
            let sectionName = [];
            dimensions.forEach((length, dimensionName) => {
                length = BigInt(length);
                let cordinate = cordinates.get(dimensionName);
                if (cordinate == null) throw new Error(`Cannot calculate address: Missing cordinate for "${dimensionName}" dimension.`);
                if (cordinate < this.#MinimumIndexPerDimension || cordinate > this.#MaximumIndexPerDimension) throw new Error(`Cannot calculate address: Invalid cordinate for "${dimensionName}" dimension, value (${cordinate}) has to be between ${this.#MinimumIndexPerDimension} to ${this.#MaximumIndexPerDimension}.`);
                cordinate = BigInt(cordinate);
                const section = cordinate / length; //Since it is Bigint it will always floor the division which is what we want here.
                sectionName.push(section);
                cordinate -= (section * length);
                address += cordinate * dimensionFactor;
                dimensionFactor *= length;
            });
            return { "address": address, "name": sectionName.join('-') };
        };
    }

    async batchPut(data, valueAttributeName = 'data') //Map Array with special attribute called data
    {
        if (!Array.isArray(data)) throw new Error(`Parameter "data", to be array of maps.`);
        if (data.length === 0) throw new Error(`Parameter "data", cannot be empty.`);

        const operations = data.reduce((acc, input) => {
            const value = input.get(valueAttributeName);
            input.delete(valueAttributeName);
            const section = this.#sectionResolver(input);
            const sectionOperations = acc.get(section.name) || [];
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(section.address, 0);
            sectionOperations.push({ type: "put", key: keyBuffer, value: value });
            acc.set(section.name, sectionOperations);
            return acc;
        }, new Map());

        const operationsPromises = [];
        const partititons = Array.from(operations.keys());
        for (let index = 0; index < partititons.length; index++) {
            const partitionKey = partititons[index];
            const sectionOperations = operations.get(partitionKey);
            const dbInstance = await this.#leveldbFactory(partitionKey, this.#options)
            operationsPromises.push(dbInstance.batch(sectionOperations));
        }
        return Promise.all(operationsPromises)
    }

    dimensionForLoop(dimensions, callback, callbackAccumulator, dimensionIndex = (dimensions.length - 1)) {
        const iteratorDefinition = dimensions[dimensionIndex];
        for (let index = iteratorDefinition.start; index <= iteratorDefinition.stop; index += iteratorDefinition.incrementby) {
            iteratorDefinition.counter = index;
            if (dimensionIndex > 0) {
                callbackAccumulator = this.#dimensionForLoop(dimensions, callback, callbackAccumulator, dimensionIndex - 1);
            }
            else {
                const coordinates = new Map(dimensions.map(e => [e.name, e.counter]));
                //console.log(`${dimensions.map(e => e.counter).join(',')}`);
                callbackAccumulator = callback(callbackAccumulator, coordinates);
            }
        }
        return callbackAccumulator;
    }

    async rangeRead(start, stop, dataCallback, sorted = false) {
        const temp= new Map();
        start.forEach((value,key)=>temp.set(key,BigInt(value)));
        start= new Map(temp);
        temp.clear();
        stop.forEach((value,key)=>temp.set(key,BigInt(value)));
        stop= new Map(temp);
        temp.clear();

        const range = [];
        start.forEach((dimensionStart, dimensionKey) => {
            range.push({
                name: dimensionKey,
                start: dimensionStart,
                stop: stop.get(dimensionKey),
                incrementby: 1n,
                sectionLength: this.#dimensions.get(dimensionKey)
            })
        });

        const queries = this.#dimensionForLoop(range, (sorted === true ? this.#convertCoordinatesToSortedQueries : this.#convertCoordinatesToOptimizedQueries), []);

        await this.#dataRead(queries, dataCallback);
    }

    convertCoordinatesToSortedQueries(accumulator, coordinates) {
        const sectionDetails = this.#sectionResolver(coordinates);
        if (accumulator.length > 0) {
            if (accumulator[accumulator.length - 1].name === sectionDetails.name && (sectionDetails.address - accumulator[accumulator.length - 1].end) === 1n) {
                accumulator[accumulator.length - 1].end = sectionDetails.address;
            }
            else {
                accumulator.push({ "name": sectionDetails.name, "startCoordinates": coordinates, "start": sectionDetails.address, "end": sectionDetails.address });
            }
        }
        else {
            accumulator.push({ "name": sectionDetails.name, "startCoordinates": coordinates, "start": sectionDetails.address, "end": sectionDetails.address });
        }
        return accumulator;
    }

    convertCoordinatesToOptimizedQueries(accumulator, coordinates) {
        const sectionDetails = this.#sectionResolver(coordinates);
        if (accumulator.length > 0) {
            let lastNameMatchingIndex = -1;
            let contigiousRangeFound = false;
            for (let index = 0; index < accumulator.length; index++) {
                if (accumulator[index].name === sectionDetails.name) {
                    lastNameMatchingIndex = index;
                    if ((sectionDetails.address - accumulator[index].end) === 1n) {
                        accumulator[index].end = sectionDetails.address;
                        contigiousRangeFound = true;
                        break;
                    }
                }
            }
            if (lastNameMatchingIndex === -1) {
                accumulator.push({ "name": sectionDetails.name, "startCoordinates": coordinates, "start": sectionDetails.address, "end": sectionDetails.address });
            }
            else if (contigiousRangeFound == false) {
                accumulator.splice(lastNameMatchingIndex, 0, { "name": sectionDetails.name, "startCoordinates": coordinates, "start": sectionDetails.address, "end": sectionDetails.address });
            }
        }
        else {
            accumulator.push({ "name": sectionDetails.name, "startCoordinates": coordinates, "start": sectionDetails.address, "end": sectionDetails.address });
        }
        return accumulator;
    }

    async dataRead(queries, dataCallback) {
        const startKeyBuffer = Buffer.allocUnsafe(8);
        const endKeyBuffer = Buffer.allocUnsafe(8);
        for (let index = 0; index < queries.length; index++) {
            const query = queries[index];
            //console.log(`Section: ${query.name} From: ${query.start} To: ${query.end} Cordinates: ${Array.from(query.startCoordinates.keys()).map(k => k + " " + query.startCoordinates.get(k)).join(',')}`);
            const dbInstance = await this.#leveldbFactory(query.name, this.#options);
            startKeyBuffer.writeBigInt64BE(query.start, 0);
            endKeyBuffer.writeBigInt64BE(query.end, 0);
            if (query.start === query.end) {
                let data = await new Promise((complete, reject) => {
                    //Invoke the callback only when no error is present, donot invoke if the error is not defined keeping it consistent with range call.
                    dbInstance.get(startKeyBuffer, (err, value) => (err == undefined) ? complete(value) : (err.type == 'NotFoundError' ? undefined : reject(err)));
                })
                const key = this.#addressToAbsoluteCoordinates(query.start, query.startCoordinates);
                await dataCallback(key, data, index, queries.length);
            }
            else {
                await new Promise((complete, reject) => {
                    let completed = false;
                    dbInstance.createReadStream({ gte: startKeyBuffer, lte: endKeyBuffer })
                        .on('data', (async function (data) {
                            data.key = Buffer.from(data.key.buffer).readBigInt64BE(0)
                            data.key = this.#addressToAbsoluteCoordinates(data.key, query.startCoordinates);
                            await dataCallback(data.key, data.value, index, queries.length);
                        }).bind(this))
                        .on('error', function (err) {
                            console.log(query.name + ": " + 'Oh my!', err)
                            reject(err);
                        })
                        .on('close', function () {
                            //console.log(query.name + ": " + 'Stream closed')
                            if (completed === false) {
                                complete();
                                completed = true;
                            };
                        })
                        .on('end', function () {
                            //console.log(query.name + ": " + 'Stream ended')
                            if (completed === false) {
                                complete();
                                completed = true;
                            };
                        });
                })
            }
        }
    }

    addressToAbsoluteCoordinates(address, sectionStart) {
        let returnCoordinates = new Map();
        let reverseDimensions = Array.from(this.#dimensions.keys()).reverse();
        for (let index = 0; index < reverseDimensions.length; index++) {
            const dimensionName = reverseDimensions[index];
            const sliceIndex = index + 1;
            let dimensionAbsolute;
            if (sliceIndex == reverseDimensions.length) {
                dimensionAbsolute = (address % this.#dimensions.get(dimensionName)) + sectionStart.get(dimensionName);
            }
            else {
                const dimensionFactor = reverseDimensions.slice(index + 1).reduce((acc, n) => acc * this.#dimensions.get(n), 1n);
                dimensionAbsolute = (address % dimensionFactor) + sectionStart.get(dimensionName);
                address = address % dimensionFactor;
            }
            returnCoordinates.set(dimensionName, dimensionAbsolute);
        }
        return returnCoordinates;
    }

}
