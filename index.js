module.exports = class Matrix {

    #MaxKeySize = 2n ** 64n - 1n; //This is a signed 64bit integer
    #MinimumIndexPerDimension = 0n;
    #MaximumIndexPerDimension;
    #partitionHeight;
    #partitionWidth;
    #leveldbFactory
    #options = { keyEncoding: 'binary', valueEncoding: 'json' };
    #sectionResolver = (cordinates) => { throw new Error("Dimensions not configured corectly."); };

    //We are using Map for dimensions cause it retains insertion order of the keys which helps us define which dimension will have be first for Row-Major-Order
    constructor(leveldbResolver, dimensions = new Map([['x', 10], ['y', 10]])) {

        if (leveldbResolver == null) throw new Error(`Parameter "leveldbResolver", cannot be null.`);
        if (dimensions.size === 0) throw new Error(`Parameter "dimensions", cannot be empty.`);

        this.#MaximumIndexPerDimension = this.#MaxKeySize / BigInt(dimensions.size);
        dimensions.forEach((maximumLength, dimensionName) => {
            if (BigInt(maximumLength) > this.#MaximumIndexPerDimension) throw new Error(`Parameter "dimensions", has an invalid dimension length for "${dimensionName}" which should not exceed ${this.#MaximumIndexPerDimension}.`)
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
        this.#rangeQueryResolver = (start, end) => {
            const dimensionNames = Arrray.from(dimensions.keys()).reverse();//This is done so we maintain row major ordering while reading.
            const queries = dimensionNames.reduce((acc, dimensionName) => {
                const dimensionLength = dimensions.get(dimensionName);
                const start = start.get(dimensionName);
                const end = end.get(dimensionName);
                const points = [start]
                for (let dimensionIndex = start; dimensionIndex < end; dimensionIndex += dimensionLength) {
                    points.push(dimensionIndex);
                }
                points.push(end);
                acc.set(dimensionName, points);
                return acc;
            }, new Map());

        };

        this.batchPut = this.batchPut.bind(this);
        this.computePartitionKeyWithCellNumber = this.computePartitionKeyWithCellNumber.bind(this);
        this.bigIntCeil = this.bigIntCeil.bind(this);
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

    bigIntCeil(a, b) {
        return a % b === 0n ? a / b : (a / b) + 1n;
    }

    computePartitionKeyWithCellNumber(x, y) {
        const horizontalSection = this.bigIntCeil(x, this.#partitionWidth);
        const verticalSection = this.bigIntCeil(y, this.#partitionHeight);
        const partitionKey = `${horizontalSection}-${verticalSection}`;
        const partitionX = x - ((this.#partitionWidth * horizontalSection) - this.#partitionWidth);
        const partitionY = y - ((this.#partitionHeight * verticalSection) - this.#partitionHeight);
        const partitionCellNumber = (partitionY * this.#partitionWidth) - (this.#partitionWidth - partitionX);
        return { key: partitionKey, cell: partitionCellNumber };
    }

    async batchRangeRead(start, end, dimensions = 2n, transform = (x, y, value) => ({ i: true, t: { x: x, y: y, v: value } })) { //x,y

        if (dimensions !== 2n) throw new Error("Current version only supports 2 dimensions");
        if (BigInt(start.length) !== dimensions) throw new Error("Invalid start point, should match the number of dimensions.");
        if (BigInt(end.length) !== dimensions) throw new Error("Invalid end point, should match the number of dimensions.");
        let startX = start[0];
        let startY = start[1];
        const endX = end[0];
        const endY = end[1];
        if (!(startX >= 1n && startX <= endX)) throw new Error("Invalid start X point, should be between 1 and end point of X.");
        if (!(startY >= 1n && startY <= endY)) throw new Error("Invalid start X point, should be between 1 and end point of Y.");
        const internalFilter = (s) => s.x >= start[0] && s.x <= end[0];

        const rangeQueries = new Map();
        const sPoint = this.computePartitionKeyWithCellNumber(startX, startY);
        const ePoint = this.computePartitionKeyWithCellNumber(endX, endY);

        while (startY <= endY) {
            const partitionStartY = (startY - (startY % this.#partitionHeight)) + 1n;
            const partitionEndY = (startY - (startY % this.#partitionHeight)) + this.#partitionHeight;
            while (startX <= endX) {
                const partitionStartX = (startX - (startX % this.#partitionWidth)) + 1n;
                const partitionEndX = (startX - (startX % this.#partitionWidth)) + this.#partitionWidth;

                const sMidPoint = this.computePartitionKeyWithCellNumber(partitionStartX, partitionStartY);
                if (!rangeQueries.has(sMidPoint.key)) rangeQueries.set(sMidPoint.key, {});
                rangeQueries.get(sMidPoint.key).start = sMidPoint.cell;
                const eMidPoint = this.computePartitionKeyWithCellNumber(partitionEndX, partitionEndY);
                rangeQueries.get(eMidPoint.key).end = eMidPoint.cell;

                startX = partitionStartX + this.#partitionWidth;
            }
            startY = partitionStartY + this.#partitionHeight;
        }

        rangeQueries.get(sPoint.key).start = sPoint.cell;
        rangeQueries.get(ePoint.key).end = ePoint.cell;


        let promises = [];
        const alias = { height: this.#partitionHeight, width: this.#partitionWidth, bigIntCeil: this.bigIntCeil };
        const partititons = Array.from(rangeQueries.keys());
        for (let index = 0; index < partititons.length; index++) {
            const partitionKey = partititons[index];
            const query = rangeQueries.get(partitionKey);
            const dbInstance = await this.#leveldbFactory(partitionKey, this.#options)
            //console.log(`${partitionKey} : ${JSONBigIntNativeParser.stringify(query)}`);
            promises.push(new Promise((complete, reject) => {
                let completed = false;
                const cellData = [];
                const offsetX = BigInt(partitionKey.split("-")[0]) - 1n;
                const offsetY = BigInt(partitionKey.split("-")[1]) - 1n;
                const startKeyBuffer = Buffer.allocUnsafe(8);
                const endKeyBuffer = Buffer.allocUnsafe(8);
                startKeyBuffer.writeBigInt64BE(query.start, 0);
                endKeyBuffer.writeBigInt64BE(query.end, 0);
                dbInstance.createReadStream({ gte: startKeyBuffer, lte: endKeyBuffer })
                    //this.#partitions.get(partitionKey).createReadStream({ gte: 3, lte: 3 })
                    .on('data', function (data) {
                        //console.log(partitionKey + ": " + data.key, '=', data.value)
                        data.key = Buffer.from(data.key.buffer).readBigInt64BE(0)
                        let Y = alias.bigIntCeil(data.key, alias.width);
                        let X = data.key - ((Y - 1n) * alias.width);
                        X = X + (offsetX * alias.width);
                        Y = Y + (offsetY * alias.height);
                        cellData.push({ x: X, y: Y, v: data.value })
                    })
                    .on('error', function (err) {
                        console.log(partitionKey + ": " + 'Oh my!', err)
                        reject(err);
                    })
                    .on('close', function () {
                        //console.log(partitionKey + ": " + 'Stream closed')
                        if (!completed) {
                            complete({ data: cellData, x: offsetX, y: offsetY });
                            completed = true;
                        };
                    })
                    .on('end', function () {
                        //console.log(partitionKey + ": " + 'Stream ended')
                        if (!completed) {
                            complete({ data: cellData, x: offsetX, y: offsetY });
                            completed = true;
                        };
                    })
            }));
        };

        let results = await Promise.all(promises);

        //Sort
        results = results.sort((a, b) => a.x < b.x ? -1 : (a.x > b.x ? 1 : 0));

        //Flatten ,Filter and Transform
        return results.reduce((acc, e) => acc.concat(e.data.reduce((acc, s) => {
            if (internalFilter(s)) {
                const transformed = transform(s.x, s.y, s.v);
                transformed.i = transformed.i || false;
                if (transformed.i) acc.push(transformed.t);
            }
            return acc;
        }, [])), []);
    }

}
