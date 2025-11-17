import animix from './Manimix.js';


const welcome = document.querySelector('.welcome')
const btn3d = document.querySelector('.btn-3d')
const up = document.querySelector('.write')

const splitWelcome = animix.splitText(welcome, {type: 'words'})
const datasplitwelcome = splitWelcome.words


const splitP = animix.splitText(up, {type:'lines'})

const tl = animix.timeline()
class anime {
  tween (){
animix.set(datasplitwelcome, {
  y: -50,
  opacity: 0
})
  
animix.to(datasplitwelcome, 0.4, {y: 0,
  stagger: 0.1,
  opacity: 1,
  ease: 'ease-in ', 
})

//lines
  animix.fromTo(splitP.lines, 0.4, {
    opacity: 0,
    y: 100,
  }, {
    opacity: 1,
    y: 0,
    stagger: 0.35,
    ease: 'ease',
  })
  
  animix.fromTo(btn3d, 1.5, {
   y: 200,
    opacity: 0,
    ease: 'ease-in'
  }, {
      y: 0,
      opacity: 1,
      ease: 'ease-in'
  })}}
  const animateLandingPage = new anime()
  window.onload = animateLandingPage.tween()