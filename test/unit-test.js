const chai = require('chai');
const sinon = require('sinon');
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
    createReadStream: sinon.fake()
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

        //2st Partition
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
        it('Parameter "data" should allow dimension indexes less than 18446744073709551615', async function () {
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
            assert.equal(error.message, `Cannot calculate address: Invalid cordinate for "${dimensionName}" dimension, value (${X}) has to be between 0 to 18446744073709551615.`, "Should not accept indexes less than 1.");
            sinon.assert.notCalled(mockResolver);
            sinon.assert.notCalled(mockDbInstance.batch);
        });

    });

});