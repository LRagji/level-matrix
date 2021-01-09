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

describe('level-matrix', function () {

    before(() => {
        MatrixUnderTest = new matrixType(mockResolver, 10n, 10n);
    })

    describe('#batchPut', function () {
        it('should not allow anything other than 2 dimensions', async function () {
            let error = await assert.rejected(async () => await MatrixUnderTest.batchPut([], 1));
            assert.equal(error.message, 'Current version only supports 2 dimensions', "Should not accept anything less than 2 dimensions.");
            error = await assert.rejected(async () => await MatrixUnderTest.batchPut([], 3));
            assert.equal(error.message, 'Current version only supports 2 dimensions', "Should not accept anything greater than 2 dimensions.");
        });

        it('should not allow data to be invalid', async function () {
            let error = await assert.rejected(async () => await MatrixUnderTest.batchPut([], 2));
            assert.equal(error.message, "Data cannot be empty and should be multiple of the dimensions defined.", "Should not accept empty array");
            error = await assert.rejected(async () => await MatrixUnderTest.batchPut(undefined, 2));
            assert.equal(error.message, "Data cannot be empty and should be multiple of the dimensions defined.", "Should not accept undefined");
            error = await assert.rejected(async () => await MatrixUnderTest.batchPut([1, 3], 2));
            assert.equal(error.message, "Data cannot be empty and should be multiple of the dimensions defined.", "Should not accept accept data which is not a multiple of dimension");
        });

        it('should only allow indexes from 1', async function () {
            const X = 0n, Y = 0n, Value = 23;
            let error = await assert.rejected(async () => await MatrixUnderTest.batchPut([X, Y, Value], 2));
            assert.equal(error.message, 'Matrix dimensions starts from 1, (0,0) is invalid.', "Should not accept indexes less than 1(Bigint).");
            error = await assert.rejected(async () => await MatrixUnderTest.batchPut([-1, -1, Value], 2));
            assert.equal(error.message, 'Matrix dimensions starts from 1, (-1,-1) is invalid.', "Should not accept indexes less than 1(Bigint).");
        });

        it('should calculate correct partition and normal data.', async function () {
            const X = 5n, Y = 5n, Value = 23;
            const expectedPartitionKey='1-1';
            const expectedOptions={keyEncoding: 'binary', valueEncoding: 'json'};
            const keyBuffer = Buffer.allocUnsafe(8);

            keyBuffer.writeBigInt64BE(computeResult.cell, 0);
            const expectedOperation={ type: "put", key: keyBuffer, value: Value }
            await MatrixUnderTest.batchPut([X, Y, Value], 2);
            assert.isTrue(mockResolver.calledOnceWith(expectedPartitionKey,expectedOptions));
            //mockDbInstance.batch.calledOnceWith()
        });
    });
});