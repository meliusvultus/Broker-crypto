const words = ['Build wealth', 'Grow your wealth', 'Earn interests'];


function dynamicHeader (arr, classtarget) {
    let arrLength = arr.length;
    let classTarget = document.querySelector(classtarget);
    let index = 0;
    setInterval(() => {
        classTarget.innerHTML = arr[index];
        index = (index + 1) % arrLength;
    }, 2000 * 2);
}
dynamicHeader(words, '.loginheader');
