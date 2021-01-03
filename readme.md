# Level-Matrix

Matrix data structure on level-db, This was conceptualized when author was trying to store timeseries data in leveldb and needed a 2 part key(tag & time) to access timeseries values. Matrix data structure was the best fit for such a operation which is now generalized and bundled into package.

### Concept:
1. This is a 2 dimensional matrix (atleast as of current release).
2. X and Y dimensions are monotonically increasing Bigints and always start with 1.
3. X and Y values are converted into a "Cell Numbers" to form the key for leveldb and is passed in as binary formatted.
4. This matrix is [row-major order](https://en.wikipedia.org/wiki/Row-_and_column-major_order) matrix so range queries will work better X dimension.
5. It is internally partitioned into multipe level db, the idea was to go as infinity as we can with the dimension.

### API:



### Math behind key calculations:
1. Whole matrix is divided into sub smaller matrix each smaller matrix is a leveldb in itself and is identified as X-Y section EG: 1-1 or 1-200 or 2-3 etc.
2. Size of each smaller matrix is defined by parameter in constructor `partitionWidth` & `partitionHeight`.
3. To find the correct leveldb we simply ceil the X & Y values EG: `horizontalSection = Ceil(X/partitionWidth)` & `verticalSection = Ceil(Y/partitionHeight)` which is then merged into string in following format `${horizontalSection}-${verticalSection}`.
4. We need to find the cell number in that data base for which we calculate the X and Y for that respective partition `partitionX = x - ((partitionWidth * horizontalSection) - partitionWidth)` simillary for Y `partitionY = y - ((partitionHeight * verticalSection) - partitionHeight)`.
5. Finally to find the cell number we do the following `partitionCellNumber = (partitionY * partitionWidth) - (partitionWidth - partitionX)`

