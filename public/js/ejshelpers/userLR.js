const words = ['start investing today', 'grow your wealth', 'earn interests'];
function dynamicHeader (arr, classtarget) {
    let arrLength = arr.length;
    let classTarget = document.querySelector(classtarget);
    let index = 0;
    setInterval(() => {
        classTarget.innerHTML = arr[index];
        let index = (index + 1) % arrLength;
    }, 2000);
}
dynamicHeader(words, '.loginheader');
