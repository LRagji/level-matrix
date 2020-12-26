class Matrix {

    #partitionHeight;
    #partitionWidth;
    #partitions = new Map();
    #dbDirectory;

    constructor(dbDirectory, partitionWidth = 86400000n, partitionHeight = 1000n) {
        this.#partitionWidth = partitionWidth;
        this.#partitionHeight = partitionHeight;
        this.#dbDirectory = dbDirectory;

        this.batchPut = this.batchPut.bind(this);
        this.computePartitionKeyWithCellNumber = this.computePartitionKeyWithCellNumber.bind(this);
        this.bigIntCeil = this.bigIntCeil.bind(this);
        this.bigIntMin = this.bigIntMin.bind(this);
    }

    async batchPut(data, dimensions = 2n) //x,y,data
    {
        if (dimensions !== 2n) throw new Error("Current version only supports 2 dimensions");

        const opertationsAndDBMap = new Map();
        for (let index = 0n; index < data.length; index += (dimensions + 1n)) {
            const x = data[index];
            const y = data[index + 1n];
            const cellData = data[index + 2n];
            if (x <= 0n || y <= 0n) throw new Error("Matrix dimensions starts from 1, (" + x + "," + y + ") is invalid.");

            const computeResult = this.computePartitionKeyWithCellNumber(x, y);
            if (!opertationsAndDBMap.has(computeResult.key)) opertationsAndDBMap.set(computeResult.key, []);
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(computeResult.cell, 0);
            opertationsAndDBMap.get(computeResult.key).push({ type: "put", key: keyBuffer, value: cellData })
        }

        const operationsPromises = [];
        opertationsAndDBMap.forEach((operations, partitionKey) => {
            if (!this.#partitions.has(partitionKey)) {
                this.#partitions.set(partitionKey, level(path.join(this.#dbDirectory, partitionKey), { keyEncoding: 'binary', valueEncoding: 'json' }));
            }
            operationsPromises.push(this.#partitions.get(partitionKey).batch(operations));
        });

        return Promise.all(operationsPromises)
    }

    bigIntCeil(a, b) {
        return a % b === 0n ? a / b : (a / b) + 1n;
    }

    bigIntMin(a, b) {
        return a < b ? a : b;
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

    async batchRead(start, end, dimensions = 2n, transform = (x, y, value) => ({ i: true, t: { x: x, y: y, v: value } })) { //x,y
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
        rangeQueries.forEach((query, partitionKey) => {
            if (!this.#partitions.has(partitionKey)) {
                this.#partitions.set(partitionKey, level(path.join(this.#dbDirectory, partitionKey), { keyEncoding: 'binary', valueEncoding: 'json' }));
            }
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
                this.#partitions.get(partitionKey).createReadStream({ gte: startKeyBuffer, lte: endKeyBuffer })
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
        });

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
