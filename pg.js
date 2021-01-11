const defaultConectionString = "postgres://postgres:@localhost:5432/Test";
const pgp = require('pg-promise')({
    /* initialization options */
    capSQL: true // capitalize all generated SQL
});
const db = pgp(defaultConectionString);

// our set of columns, to be created only once (statically), and then reused,
// to let it cache up its formatting templates for high performance:
const cs = new pgp.helpers.ColumnSet(['T', 'S', 'L', 'V'], { table: 'Matrix' });

// data input values:
const values = [];
const time = 0n;
for (let tagCounter = 0; tagCounter < 100000; tagCounter++) {
    values.push({
        T: time,
        S: tagCounter.toString(),
        L: 'Good',
        V: { t: 'number', v: 67 }
    })
}


// generating a multi-row insert query:
const query = pgp.helpers.insert(values, cs);
//=> INSERT INTO "tmp"("col_a","col_b") VALUES('a1','b1'),('a2','b2')

// executing the query:
console.time("PG-Insert")
db.none(query).then((r) => {
    console.timeEnd("PG-Insert");
});


//-----------------------------------------Level--------------------------------------
var level = require('level-party')
var levelDB = level(__dirname + '/ignore', { valueEncoding: 'json' })

const operations = [];
for (let tagCounter = 0; tagCounter < 100000; tagCounter++) {
    const sample = {
        L: 'Good',
        V: { t: 'number', v: 67 }
    }
    const keyBuffer = Buffer.allocUnsafe(8);
    keyBuffer.writeBigInt64BE(BigInt(tagCounter), 0);
    operations.push({ type: "put", key: keyBuffer, value: sample })
}
console.time("Level-Insert")
levelDB.batch(operations).then((r) => {
    console.timeEnd("Level-Insert");
});
