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

let mockDbInstance = {
    batch: sinon.fake.resolves(),
    createReadStream: sinon.fake.throws("Did not set up read function")
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

    describe.skip('#constructor', function () {
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

    describe.skip('#batchPut General Validations', function () {

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

    describe.skip('#batchPut 1 Dimension', function () {

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

    describe.skip('#batchPut 2 Dimension', function () {

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
        it('Parameter "data" should not allow dimension indexes less than 9223372036854775807', async function () {
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

    describe('#rangeRead', function () {

        it('should resolve to correct address for left edge of the section', async function () {
            //Setup
            const dimensionNameX = 'X';
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
            mockDbInstance.createReadStream = sinon.fake(selfClosingStream(5));
            mockDbInstance.get = sinon.fake((key, callback) => callback(undefined, undefined));
            const actualCallBack = sinon.fake();

            //Invoke
            await Matrix.rangeRead(new Map([[dimensionNameX, 0], [dimensionNameY, 0]]), new Map([[dimensionNameX, 20], [dimensionNameY, 1]]), console.log, true);

            //Expectations
            //sinon.assert.calledOnceWithExactly(mockResolver, expectedPartitionKey, expectedOptions);

        });

    });

});