// async function dimensionForLoop(startVector = [0, 0, 0], stopVector = [10, 10, 10], incrementVector = [1, 1, 1], loopCallback = async (coordinate, counter, stop) => console.log(`${counter} of ${stop} = ${coordinate.join(' ')}`) === undefined, includeStopVector = false) {
//     if (!(stopVector.length === startVector.length && startVector.length === incrementVector.length)) {
//         throw new Error(`All vectors should be of same dimensions, Start:${startVector.length}, Stop:${stopVector.length}, Increment:${incrementVector.length}`);
//     }
//     const startVectorIsSmaller = startVector.reduce((acc, e, idx) => acc && e < stopVector[idx] && e >=0, true);
//     if (startVectorIsSmaller === false) {
//         throw new Error(`Start vector has to be smaller than Stop vector and should be positive numbers.`);
//     }

//     const delta = stopVector.map((e, idx) => BigInt(e - startVector[idx]));
//     const relativeStop = delta.reduce((acc, e) => acc * e, 1n);
//     const incrementby = incrementVector.reduce((acc, e) => acc * BigInt(e), 1n);
//     let move = true;
//     for (let counter = 0n; counter < relativeStop && move === true; counter += incrementby) {
//         let result = delta.reduce((context, delta, idx) => {
//             context.coordinates.push(BigInt(startVector[idx]) + (context.overflow % delta));
//             context.overflow = context.overflow / delta;
//             return context;
//         }, { overflow: counter, coordinates: [] });
//         move = await loopCallback(result.coordinates, counter, relativeStop);
//     }
//     if ((move && includeStopVector) === true) {
//         stopVector = stopVector.map(e => BigInt(e));
//         await loopCallback(stopVector, relativeStop + 1n, relativeStop);
//     }
// }

// dimensionForLoop([10, 10, 10], [15, 13, 14], [4, 1, 1], undefined, true);
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// async function dimensionForLoop(startVector = [0, 0, 0], stopVector = [10, 10, 10], loopCallback = async (coordinate, counter, stop) => { console.log(`${counter} of ${stop} = ${coordinate.join(' ')}`); return counter + 1n }, includeStopVector = true) {
//     if (!(stopVector.length === startVector.length)) {
//         throw new Error(`All vectors should be of same dimensions, Start:${startVector.length}, Stop:${stopVector.length}`);
//     }
//     const startVectorIsSmaller = startVector.reduce((acc, e, idx) => acc && e < stopVector[idx] && e >= 0, true);
//     if (startVectorIsSmaller === false) {
//         throw new Error(`Start vector has to be smaller than Stop vector and should be positive numbers.`);
//     }

//     if (includeStopVector === true) {
//         stopVector = stopVector.map(e => BigInt(e + 1n));
//     }

//     const delta = stopVector.map((e, idx) => BigInt(e - startVector[idx]));
//     const relativeStop = delta.reduce((acc, e) => acc * e, 1n);
//     let counter = 0n;
//     while (counter < relativeStop) {
//         let result = delta.reduce((context, delta, idx) => {
//             context.coordinates.push(BigInt(startVector[idx]) + (context.overflow % delta));
//             context.overflow = context.overflow / delta;
//             return context;
//         }, { overflow: counter, coordinates: [] });

//         counter = BigInt(await loopCallback(result.coordinates, counter, relativeStop));
//     }
// }

// async function sortedRangeRead(start, stop, callback) {
//     const dimensionNames = Array.from(dimensions.keys());
//     const firstDimensionLength = BigInt(dimensions.get(dimensionNames[0]));
//     const range = dimensionNames.reduce((acc, dimensionName) => {
//         acc.startVector.push(BigInt(start.get(dimensionName)));
//         acc.stopVector.push(BigInt(stop.get(dimensionName)));
//         return acc;
//     }, { startVector: [], stopVector: [] });

//     let previous = null;
//     await dimensionForLoop(range.startVector, range.stopVector, async (coordinate, counter, stop) => {
//         const distanceToCover = range.stopVector[0] - coordinate[0];
//         const modulosSpace = distanceToCover > firstDimensionLength ? firstDimensionLength : distanceToCover;
//         const offset = modulosSpace === 0n ? 1n : (modulosSpace - (coordinate[0] % modulosSpace));
//         //console.log(coordinate.join(',') + "  +" + offset);

//         if (previous !== null) {
//             console.log(`From: ${previous.join(',')} To: ${coordinate.join(',')} +${offset}`);
//             if (offset === 1n && firstDimensionLength !== 1n) {//Reset when rollover happens only if increment by 1 is not specififed.
//                 previous = null;
//             }
//             else {
//                 previous = coordinate;
//             }
//         }
//         else {
//             previous = coordinate;
//         }

//         return counter += offset;

//     }, true);
// }

// const dimensions = new Map([['x', 5], ['y', 5], ['z', 5]]);

// sortedRangeRead(new Map([['x', 3], ['y', 0], ['z', 0]]), new Map([['x', 4], ['y', 1], ['z', 1]]))

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// function sectionResolver(cordinates, dimensions) {
//     const MaximumIndexPerDimension = (2n ** 64n - 1n) / BigInt(dimensions.size);
//     if (cordinates.size !== dimensions.size) throw new Error(`Cannot calculate address: cordinates should match dimensions length ${dimensions.size}.`);
//     let address = 0n;
//     let dimensionFactor = 1n;
//     let sectionName = [];
//     dimensions.forEach((length, dimensionName) => {
//         length = BigInt(length);
//         let cordinate = cordinates.get(dimensionName);
//         if (cordinate == null) throw new Error(`Cannot calculate address: Missing cordinate for "${dimensionName}" dimension.`);
//         if (cordinate < 0n || cordinate > MaximumIndexPerDimension) throw new Error(`Cannot calculate address: Invalid cordinate for "${dimensionName}" dimension, value (${cordinate}) has to be between ${0n} to ${MaximumIndexPerDimension}.`);
//         cordinate = BigInt(cordinate);
//         const section = cordinate / length; //Since it is Bigint it will always floor the division which is what we want here.
//         sectionName.push(section);
//         cordinate -= (section * length);
//         address += cordinate * dimensionFactor;
//         dimensionFactor *= length;
//     });
//     return { "address": address, "name": sectionName.join('-') };
// };


// function loop(dimensions, callback, dimensionIndex = (dimensions.length - 1)) {
//     const iteratorDefinition = dimensions[dimensionIndex];
//     for (let index = iteratorDefinition.start; index < iteratorDefinition.stop; index += iteratorDefinition.incrementby) {
//         iteratorDefinition.counter = index;
//         if (dimensionIndex > 0) {
//             loop(dimensions, callback, dimensionIndex - 1);
//         }
//         else {
//             const coordinates = new Map(dimensions.map(e => [e.name, e.counter]));
//             //console.log(coordinates.join(',') + `     ${dimensions.map(e => Math.floor(e.counter / e.sectionLength)).join('-')}      ${dimensions.map(e => e.counter - e.start).join('-')}`);
//             callback(coordinates);
//         }
//     }
// }

// function processSortedCoordinate(context) {
//     return (coordinates) => {
//         const sectionDetails = sectionResolver(coordinates, context.dimensions);
//         if (context.query.has(sectionDetails.name)) {
//             context.query.get(sectionDetails.name).end = sectionDetails.address;
//         }
//         else {
//             if (context.query.size > 0) {
//                 const sectionName = Array.from(context.query.keys())[0];
//                 const range = context.query.get(sectionName);
//                 console.log(`${sectionName} start: ${range.start} end: ${range.end}`);
//                 context.query.clear();
//             }
//             context.query.set(sectionDetails.name, { "start": sectionDetails.address, "end": sectionDetails.address });
//         }
//         //console.log(Array.from(coordinates.values()).join(',') + ` Name:${sectionDetails.name} Address:${sectionDetails.address}`);
//     }
// }

// function range(start = new Map([['x', 10], ['y', 10], ['z', 10]]), stop = new Map([['x', 20], ['y', 20], ['z', 20]]), section = new Map([['x', 5], ['y', 5], ['z', 5]])) {
//     const range = [];
//     start.forEach((dimensionStart, dimensionKey) => {
//         range.push({
//             name: dimensionKey,
//             start: dimensionStart,
//             stop: stop.get(dimensionKey),
//             incrementby: 1,
//             sectionLength: section.get(dimensionKey)
//         })
//     });
//     loop(range, processSortedCoordinate({ dimensions: section, query: new Map() }));
// }
// range();

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


var level = require('level')
var db = level(__dirname + '/data', { keyEncoding: 'binary', valueEncoding: 'json' })
const start = Buffer.allocUnsafe(8);
start.writeBigInt64BE(1n, 0);
const end = Buffer.allocUnsafe(8);
end.writeBigInt64BE(2n, 0);
let x = new Promise((a, r) => {
    db.createReadStream({ gte: start, lte: start })
        .on('data', function (data) {
            console.log(data.key, '=', data.value)
        })
        .on('error', function (err) {
            console.log('Oh my!', err)
            r();
        })
        .on('close', function () {
            console.log('Stream closed')
            //setTimeout(a,5000); 
        a();
        })
        .on('end', function () {
            console.log('Stream ended')
            a();
        })
});
x.then((e) =>
    console.log("Done")
)


// const dimensions = new Map([['x', 5n], ['y', 5n], ['z', 5n]]);
// let address = 49n;

//let dimensionFactor = 1n;
// dimensions.forEach((length, name) => {
//     if (dimensionFactor === 1n) {
//         console.log(`${name}:${address % length} D:${dimensionFactor}`);
//     }
//     else {
//         console.log(`${name}:${address/dimensionFactor} D:${dimensionFactor}`);
//         address = address % dimensionFactor;
//     }
//     dimensionFactor *= length;
// }


// let reverseDimensions = Array.from(dimensions.keys()).reverse();
// for (let index = 0; index < reverseDimensions.length; index++) {
//     const name = reverseDimensions[index];
//     const sliceIndex = index + 1;
//     if (sliceIndex == reverseDimensions.length) {
//         console.log(`${name}:${address % dimensions.get(name)}`);
//     }
//     else {
//         const dimensionFactor = reverseDimensions.slice(index + 1).reduce((acc, n) => acc * dimensions.get(n), 1n);
//         console.log(`${name}:${address / dimensionFactor} D:${dimensionFactor}`);
//         address = address % dimensionFactor;
//     }
// }