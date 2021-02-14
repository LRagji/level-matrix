const chai = require('chai');
const sinon = require('sinon');
const stream = require('stream');
const assert = chai.assert;


const matrixType = require('../index.js');
let MatrixUnderTest;

assert.rejected = async (fn) => {
    let error;
    try {
        await fn();
    }
    catch (err) {
        error = err;
    }
    return error;
}

// sinon.getMatchingFake = (fake, ...args) => fake.getCalls().find(invocation => invocation.calledWith(...args));
sinon.getMatchingFake = (invocations, remove = true, ...args) => {
    let matchingInvocation;
    const index = invocations.findIndex(invocation => invocation.calledWith(...args));
    if (index === -1) {
        sinon.assert.fail(`Cannot find invocation with these arguments.`)
    }
    else {
        matchingInvocation = invocations[index];
        if (remove === true) {
            invocations.splice(index, 1)
        }
    }
    return matchingInvocation;
};
sinon.assert.fakeCallOrder = (...fakes) => fakes.reduce((acc, e, idx) => e.calledAfter(acc) ? e : sinon.assert.fail(`Invalid Call order, Invocation at ${idx} & previous was not in order.`));
sinon.getBufferForBigInt = (value) => {
    const returnBuffer = Buffer.allocUnsafe(8);
    returnBuffer.writeBigInt64BE(value);
    return returnBuffer;
}


let mockDbInstance = {
    batch: sinon.fake.resolves(),
    get: sinon.fake((key, callback) => callback(undefined, key.readBigInt64BE(0))),
    createReadStream: sinon.fake((query) => {
        const mockedStream = new stream.PassThrough({ objectMode: true });
        setTimeout(() => {
            query.gte = Buffer.from(query.gte).readBigInt64BE(0);
            query.lte = Buffer.from(query.lte).readBigInt64BE(0);
            for (let addressCounter = query.gte; addressCounter <= query.lte; addressCounter++) {
                mockedStream.write({ key: sinon.getBufferForBigInt(addressCounter), value: addressCounter });
            }
            mockedStream.destroy();
        }, 5);
        return mockedStream;
    })

};
let mockResolver = sinon.fake.resolves(mockDbInstance);

const totalKeySize = 18446744073709551615n;

describe('level-matrix', function () {

    before(() => {
        MatrixUnderTest = new matrixType(mockResolver);
    });

    afterEach(() => {
        sinon.reset();
    });

    describe('#constructor', function () {
        it('should throw when dimesions is empty', async function () {
            assert.isNotNull(new matrixType(mockResolver, undefined), `Should default when undefined is passed`);
            let error = await assert.rejected(async () => new matrixType(mockResolver, new Map()));
            assert.equal(error.message, `Parameter "dimensions", cannot be empty.`, "Should not accept empty dimensions");
        });

        it('should throw when resolver is null or undefined', async function () {
            let error = await assert.rejected(async () => new matrixType(null));
            assert.equal(error.message, `Parameter "leveldbResolver", cannot be null.`, "Should not accept null");
            error = await assert.rejected(async () => new matrixType(undefined));
            assert.equal(error.message, `Parameter "leveldbResolver", cannot be null.`, "Should not accept null");
        });

        it('should throw when dimesions length is bigger than allowed', async function () {
            //1 Dimension
            let error = await assert.rejected(async () => new matrixType(mockResolver, new Map([['X', (totalKeySize / 1n) + 1n]])));
            assert.equal(error.message, `Parameter "dimensions", has an invalid dimension length for "X" which should not exceed ${(totalKeySize / 1n)}.`);
            //5 Dimension
            error = await assert.rejected(async () => new matrixType(mockResolver, new Map([['A', (totalKeySize / 5n)], ['B', (totalKeySize / 5n)], ['C', (totalKeySize / 5n) + 1n], ['D', (totalKeySize / 5n)], ['E', (totalKeySize / 5n)]])));
            assert.equal(error.message, `Parameter "dimensions", has an invalid dimension length for "C" which should not exceed ${(totalKeySize / 5n)}.`);
        });
    });

    describe('#batchPut General Validations', function () {

        it('Parameter "data" should not allow non array values', async function () {
            //Setup
            const oneDimensionMatrix = new matrixType(mockResolver);

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut(undefined));

            //Expectations
            assert.equal(error.message, `Parameter "data", to be array of maps.`, "Should not accept indexes less than 1.");
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

        it('Parameter "data" should not allow empty array', async function () {
            //Setup
            const oneDimensionMatrix = new matrixType(mockResolver);

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([]));

            //Expectations
            assert.equal(error.message, `Parameter "data", cannot be empty.`, "Should not accept indexes less than 1.");
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

        it('Parameter "data" should allow dimension indexes starting from 0 only', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = -1;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: Invalid cordinate for "${dimensionName}" dimension, value (${X}) has to be between 0 to 18446744073709551615.`, "Should not accept indexes less than 1.");
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

        it('Parameter "data" should have correct number of dimensions as per constructor', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 1;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], ['Y', 2], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: cordinates should match dimensions length 1.`);
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

        it('Parameter "data" should not allow missing dimension', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 1;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([new Map([['Y', X], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: Missing cordinate for "X" dimension.`);
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

        it('Parameter "data" should not allow null value for dimension', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = null;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: Missing cordinate for "X" dimension.`);
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });
    });

    describe('#batchPut 1 Dimension', function () {

        //1st Partition
        it('should work with 1 dimension within left edge of first partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 0;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '0';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(BigInt(X), 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        it('should work with 1 dimension within middle of first partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 5;
            const Value = 'Middle';
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '0';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(BigInt(X), 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        it('should work with 1 dimension within right edge of first partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const Value = "Right Egde";
            const partitionSizeOfDimension = 10;
            const X = partitionSizeOfDimension - 1;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '0';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(BigInt(X), 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        //2nd Partition
        it('should work with 1 dimension within left edge of second partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 10;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '1';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(0n, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        it('should work with 1 dimension within middle of second partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = 15;
            const Value = 'Middle';
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '1';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(5n, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        it('should work with 1 dimension within right edge of second partition', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const Value = "Right Egde";
            const partitionSizeOfDimension = 10;
            const X = 19;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = '1';
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(9n, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        //Nth Partition
        it('should work with 1 dimension right edge or last key index.', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10;
            const X = totalKeySize;
            const Value = "Left Egde";
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));
            const expectedPartitionKey = (X / BigInt(partitionSizeOfDimension)).toString();
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            keyBuffer.writeBigInt64BE(BigInt(X) - (BigInt(expectedPartitionKey) * BigInt(partitionSizeOfDimension)), 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        //General validation for 1 Dimension
        it('Parameter "data" should not allow dimension indexes less than 18446744073709551615', async function () {
            //Setup
            const dimensionName = 'X';
            const defaultAttributeName = 'data';
            const X = totalKeySize + 1n;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const oneDimensionMatrix = new matrixType(mockResolver, new Map([[dimensionName, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await oneDimensionMatrix.batchPut([new Map([[dimensionName, X], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: Invalid cordinate for "${dimensionName}" dimension, value (${X}) has to be between 0 to 18446744073709551615.`);
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

    });

    describe('#batchPut 2 Dimension', function () {

        //1st Partition
        it('should work with 2 dimension within left edge of first partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10;
            const X = 0n;
            const Y = 0n;
            const Value = "Left Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        it('should work with 2 dimension within middle of first partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10;
            const X = 5n;
            const Y = 5n;
            const Value = "Middle";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        it('should work with 2 dimension within right edge of first partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10n;
            const X = partitionSizeOfDimension - 1n;
            const Y = partitionSizeOfDimension - 1n;
            const Value = "Right Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        //2nd Partition
        it('should work with 2 dimension within left edge of second partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10n;
            const X = partitionSizeOfDimension;
            const Y = partitionSizeOfDimension;
            const Value = "Left Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        it('should work with 2 dimension within middle of second partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10n;
            const X = partitionSizeOfDimension + 2n;
            const Y = partitionSizeOfDimension + 3n;
            const Value = "Middle Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        it('should work with 1 dimension within right edge of second partition', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10n;
            const X = (partitionSizeOfDimension * 2n) - 1n;
            const Y = (partitionSizeOfDimension * 2n) - 1n;
            const Value = "Right Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);
        });

        //Nth Partition
        it('should work with 2 dimension right edge or last key index.', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const partitionSizeOfDimension = 10;
            const X = totalKeySize / 2n;
            const Y = totalKeySize / 2n;
            const Value = "Last Egde";
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
            const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
            const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
            const keyBuffer = Buffer.allocUnsafe(8);
            const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
            keyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
            const expectedOperation = { type: "put", key: keyBuffer, value: Value }

            //Invoke
            await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]);

            //Expectations
            sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
            sinon.assert.calledOnceWithExactly(mockDbInstance.batch, [expectedOperation]);

        });

        //General validation for 2 Dimension
        it('Parameter "data" should only allow dimension indexes less than 9223372036854775807', async function () {
            //Setup
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const defaultAttributeName = 'data';
            const X = (totalKeySize / 2n);
            const Y = (totalKeySize / 2n) + 1n;
            const Value = "Left Egde";
            const partitionSizeOfDimension = 10;
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));

            //Invoke
            let error = await assert.rejected(async () => await Matrix.batchPut([new Map([[dimensionNameX, X], [dimensionNameY, Y], [defaultAttributeName, Value]])]));

            //Expectations
            assert.equal(error.message, `Cannot calculate address: Invalid cordinate for "${dimensionNameY}" dimension, value (${Y}) has to be between 0 to 9223372036854775807.`);
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

    });


    //---------------------------------------------------------------------------------------- Read Tests ----------------------------------------------------------------------------------

    describe('#rangeRead General Validations', function () {

        it('should not allow nulls or undefined for start, stop and datacallback', async function () {
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const partitionSizeOfDimension = 5;
            const X = 0n;
            const Y = 0n;
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));


            let error = await assert.rejected(async () => Matrix.rangeRead(null, new Map(), () => { }));
            assert.equal(error.message, `Invalid Parameter "start" it should be a Map instance.`);
            error = await assert.rejected(async () => Matrix.rangeRead(undefined, new Map(), () => { }));
            assert.equal(error.message, `Invalid Parameter "start" it should be a Map instance.`);
            error = await assert.rejected(async () => Matrix.rangeRead([], new Map(), () => { }));
            assert.equal(error.message, `Invalid Parameter "start" it should be a Map instance.`);

            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), null, () => { }));
            assert.equal(error.message, `Invalid Parameter "stop" it should be a Map instance.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), undefined, () => { }));
            assert.equal(error.message, `Invalid Parameter "stop" it should be a Map instance.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), [], () => { }));
            assert.equal(error.message, `Invalid Parameter "stop" it should be a Map instance.`);

            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), new Map(), undefined));
            assert.equal(error.message, `Invalid Parameter "dataCallback" it should be a function.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), new Map(), null));
            assert.equal(error.message, `Invalid Parameter "dataCallback" it should be a function.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), new Map(), {}));
            assert.equal(error.message, `Invalid Parameter "dataCallback" it should be a function.`);

        });

        it('should only allow equal number of dimensions for start and stop parameters', async function () {
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const partitionSizeOfDimension = 5;
            const X = 0n;
            const Y = 0n;
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));

            let error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, partitionSizeOfDimension]]), new Map(), () => { }));
            assert.equal(error.message, `Invalid Parameter "start"(1) or "stop"(0); they should match on number of dimensions.`);

            error = await assert.rejected(async () => Matrix.rangeRead(new Map(), new Map([[dimensionNameX, partitionSizeOfDimension]]), () => { }));
            assert.equal(error.message, `Invalid Parameter "start"(0) or "stop"(1); they should match on number of dimensions.`);
        });

        it('should only allow undefined or numerically incorect indexes for start and stop parameters', async function () {
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const partitionSizeOfDimension = 5;
            const X = 0n;
            const Y = 0n;
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));

            let error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, -1]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Parameter "start", has an invalid index "-1" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, undefined]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Parameter "start", has an invalid index "undefined" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, null]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Parameter "start", has an invalid index "null" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 9223372036854775807n + 1n]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Parameter "start", has an invalid index "9223372036854775808" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, {}]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Cannot convert [object Object] to a BigInt`);


            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([[dimensionNameX, -1]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "-1" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([[dimensionNameX, undefined]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "undefined" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([[dimensionNameX, null]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "null" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([[dimensionNameX, 9223372036854775807n + 1n]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "9223372036854775808" for "X" dimension which should be between 0 and 9223372036854775807.`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([[dimensionNameX, {}]]), () => { }));
            assert.equal(error.message, `Cannot convert [object Object] to a BigInt`);
            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 10]]), new Map([[dimensionNameX, 5]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "5" for "X" dimension which should be between 10 and 9223372036854775807.`);

        });

        it('should only allow dimensions which are already defined', async function () {
            const dimensionNameX = 'X';
            const dimensionNameY = 'Y';
            const partitionSizeOfDimension = 5;
            const X = 0n;
            const Y = 0n;
            const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));

            let error = await assert.rejected(async () => Matrix.rangeRead(new Map([['L', -1]]), new Map([[dimensionNameX, 0]]), () => { }));
            assert.equal(error.message, `Parameter "start", has an invalid dimension("L") which has no defined length or is a new dimension.`);

            error = await assert.rejected(async () => Matrix.rangeRead(new Map([[dimensionNameX, 0]]), new Map([['L', -1]]), () => { }));
            assert.equal(error.message, `Parameter "stop", has an invalid index "undefined" for "X" dimension which should be between 0 and 9223372036854775807.`);

        });
    });

    describe('#rangeRead', function () {

        describe('for single read', function () {

            it('should resolve to correct address for left edge of the section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const selfClosingStream = (time) => {
                    return () => {
                        const mockedStream = new stream.PassThrough();
                        setTimeout(() => mockedStream.destroy(), time);
                        return mockedStream;
                    }
                }
                // mockDbInstance.createReadStream = sinon.fake(selfClosingStream(5));
                // mockDbInstance.get = sinon.fake((key, callback) => callback(undefined, undefined));
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, true);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 0n, 0, 1);

            });

            it('should resolve to correct address for right edge of the section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 4n;
                const Y = 4n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const selfClosingStream = (time) => {
                    return () => {
                        const mockedStream = new stream.PassThrough();
                        setTimeout(() => mockedStream.destroy(), time);
                        return mockedStream;
                    }
                }
                // mockDbInstance.createReadStream = sinon.fake(selfClosingStream(5));
                // mockDbInstance.get = sinon.fake((key, callback) => callback(undefined, undefined));
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, true);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 24n, 0, 1);

            });

            it('should resolve to correct address for middle part of the section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 2n;
                const Y = 2n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const selfClosingStream = (time) => {
                    return () => {
                        const mockedStream = new stream.PassThrough();
                        setTimeout(() => mockedStream.destroy(), time);
                        return mockedStream;
                    }
                }
                // mockDbInstance.createReadStream = sinon.fake(selfClosingStream(5));
                // mockDbInstance.get = sinon.fake((key, callback) => callback(undefined, undefined));
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, true);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 12n, 0, 1);

            });

            it('should resolve to correct address for next section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 5n;
                const Y = 5n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, true);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 0n, 0, 1);

            });

            it('should resolve to correct address for left edge of the section for unsorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, false);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 0n, 0, 1);

            });

            it('should resolve to correct address for right edge of the section for unsorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 4n;
                const Y = 4n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, false);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 24n, 0, 1);

            });

            it('should resolve to correct address for middle part of the section for unsorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 2n;
                const Y = 2n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, false);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 12n, 0, 1);

            });

            it('should resolve to correct address for next section for unsorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 5n;
                const Y = 5n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const expectedKeyBuffer = Buffer.allocUnsafe(8);
                const relativeAddX = BigInt(X) - ((X / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                const relativeAddY = BigInt(Y) - ((Y / BigInt(partitionSizeOfDimension)) * BigInt(partitionSizeOfDimension));
                expectedKeyBuffer.writeBigInt64BE((BigInt(partitionSizeOfDimension) * relativeAddY) + relativeAddX, 0);
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, X], [dimensionNameY, Y]]), dataCallBack, false);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.get, expectedKeyBuffer);
                sinon.assert.calledOnceWithExactly(dataCallBack, new Map([[dimensionNameX, X], [dimensionNameY, Y]]), 0n, 0, 1);

            });
        });

        describe('for range read', function () {

            it('should resolve to correct address for entire section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, partitionSizeOfDimension - 1], [dimensionNameY, partitionSizeOfDimension - 1]]), dataCallBack, true);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.createReadStream, { gte: 0n, lte: 24n });
                sinon.assert.callCount(dataCallBack, (partitionSizeOfDimension * partitionSizeOfDimension))
                sinon.assert.match(dataCallBack.firstCall.args, [new Map([[dimensionNameX, 0n], [dimensionNameY, 0n]]), 0n, 0, 1]);
                sinon.assert.match(dataCallBack.lastCall.args, [new Map([[dimensionNameX, BigInt(partitionSizeOfDimension - 1)], [dimensionNameY, BigInt(partitionSizeOfDimension - 1)]]), 24n, 0, 1]);
            });

            it('should resolve to correct address for across section for sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]), dataCallBack, true);

                //Expectations
                sinon.assert.callCount(mockResolver, 12);
                sinon.assert.callCount(mockDbInstance.createReadStream, 6);
                sinon.assert.callCount(mockDbInstance.get, 6);
                let resolverInvocations = mockResolver.getCalls();
                let createStreamInvocations = mockDbInstance.createReadStream.getCalls();
                let singleGetInvocations = mockDbInstance.get.getCalls();
                sinon.assert.fakeCallOrder(
                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 0n, lte: 4n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 5n, lte: 9n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 10n, lte: 14n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 15n, lte: 19n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 20n, lte: 24n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-1', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 0n, lte: 4n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-1', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),
                );
                sinon.assert.callCount(dataCallBack, 36);
                let callbackInvocations = dataCallBack.getCalls();
                sinon.assert.fakeCallOrder(
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 0n]]), 0n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 0n]]), 1n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 0n]]), 2n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 0n]]), 3n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 0n]]), 4n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 0n]]), 0n, 1, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 1n]]), 5n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 1n]]), 6n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 1n]]), 7n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 1n]]), 8n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 1n]]), 9n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 1n]]), 5n, 3, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 2n]]), 10n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 2n]]), 11n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 2n]]), 12n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 2n]]), 13n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 2n]]), 14n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 2n]]), 10n, 5, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 3n]]), 15n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 3n]]), 16n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 3n]]), 17n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 3n]]), 18n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 3n]]), 19n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 3n]]), 15n, 7, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 4n]]), 20n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 4n]]), 21n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 4n]]), 22n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 4n]]), 23n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 4n]]), 24n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 4n]]), 20n, 9, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 5n]]), 0n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 5n]]), 1n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 5n]]), 2n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 5n]]), 3n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 5n]]), 4n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 5n]]), 0n, 11, 12)

                );
                assert.equal(callbackInvocations.length, 0);
            });

            it('should resolve to correct address for entire section for un-sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedPartitionKey = `${(X / BigInt(partitionSizeOfDimension)).toString()}-${(Y / BigInt(partitionSizeOfDimension)).toString()}`;
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, partitionSizeOfDimension - 1], [dimensionNameY, partitionSizeOfDimension - 1]]), dataCallBack, false);

                //Expectations
                sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);
                sinon.assert.calledOnceWithMatch(mockDbInstance.createReadStream, { gte: 0n, lte: 24n });
                sinon.assert.callCount(dataCallBack, (partitionSizeOfDimension * partitionSizeOfDimension))
                sinon.assert.match(dataCallBack.firstCall.args, [new Map([[dimensionNameX, 0n], [dimensionNameY, 0n]]), 0n, 0, 1]);
                sinon.assert.match(dataCallBack.lastCall.args, [new Map([[dimensionNameX, BigInt(partitionSizeOfDimension - 1)], [dimensionNameY, BigInt(partitionSizeOfDimension - 1)]]), 24n, 0, 1]);
            });

            it('should resolve to correct address for across section for un-sorted read', async function () {
                //Setup
                const dimensionNameX = 'X'; 1
                const dimensionNameY = 'Y';
                const partitionSizeOfDimension = 5;
                const X = 0n;
                const Y = 0n;
                const Matrix = new matrixType(mockResolver, new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]));
                const expectedOptions = { keyEncoding: 'binary', valueEncoding: 'json' };
                const dataCallBack = sinon.fake.resolves();

                //Invoke
                await Matrix.rangeRead(new Map([[dimensionNameX, X], [dimensionNameY, Y]]), new Map([[dimensionNameX, partitionSizeOfDimension], [dimensionNameY, partitionSizeOfDimension]]), dataCallBack, false);

                //Expectations
                sinon.assert.callCount(mockResolver, 12);
                sinon.assert.callCount(mockDbInstance.createReadStream, 6);
                sinon.assert.callCount(mockDbInstance.get, 6);
                let resolverInvocations = mockResolver.getCalls();
                let createStreamInvocations = mockDbInstance.createReadStream.getCalls();
                let singleGetInvocations = mockDbInstance.get.getCalls();
                sinon.assert.fakeCallOrder(
                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 0n, lte: 4n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 5n, lte: 9n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 10n, lte: 14n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 15n, lte: 19n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-0', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 20n, lte: 24n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-0', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),

                    sinon.getMatchingFake(resolverInvocations, true, '0-1', expectedOptions),
                    sinon.getMatchingFake(createStreamInvocations, true, { gte: 0n, lte: 4n }),
                    sinon.getMatchingFake(resolverInvocations, true, '1-1', expectedOptions),
                    sinon.getMatchingFake(singleGetInvocations, true, sinon.getBufferForBigInt(0n)),
                );
                sinon.assert.callCount(dataCallBack, 36);
                let callbackInvocations = dataCallBack.getCalls();
                sinon.assert.fakeCallOrder(
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 0n]]), 0n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 0n]]), 1n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 0n]]), 2n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 0n]]), 3n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 0n]]), 4n, 0, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 0n]]), 0n, 1, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 1n]]), 5n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 1n]]), 6n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 1n]]), 7n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 1n]]), 8n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 1n]]), 9n, 2, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 1n]]), 5n, 3, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 2n]]), 10n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 2n]]), 11n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 2n]]), 12n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 2n]]), 13n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 2n]]), 14n, 4, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 2n]]), 10n, 5, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 3n]]), 15n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 3n]]), 16n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 3n]]), 17n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 3n]]), 18n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 3n]]), 19n, 6, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 3n]]), 15n, 7, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 4n]]), 20n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 4n]]), 21n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 4n]]), 22n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 4n]]), 23n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 4n]]), 24n, 8, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 4n]]), 20n, 9, 12),

                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 0n], [dimensionNameY, 5n]]), 0n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 1n], [dimensionNameY, 5n]]), 1n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 2n], [dimensionNameY, 5n]]), 2n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 3n], [dimensionNameY, 5n]]), 3n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 4n], [dimensionNameY, 5n]]), 4n, 10, 12),
                    sinon.getMatchingFake(callbackInvocations, true, new Map([[dimensionNameX, 5n], [dimensionNameY, 5n]]), 0n, 11, 12)

                );
                assert.equal(callbackInvocations.length, 0);
            });
        });
    });

});