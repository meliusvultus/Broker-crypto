const arr = ['start investing today', 'grow your wealth', 'earn interests'];
function dynamicHeader (arr) {
    let arrLength = arr.length;
    console.log(arrLength)
    let index = 0;
    setTimeout((index) => {
        index ++
    }, 2000);
    let Loopindex = index % arr.Length;
    return arr[Loopindex]
}

export default dynamicHeader;