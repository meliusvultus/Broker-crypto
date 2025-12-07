import express, { Router } from 'express';
import dynamicHeader from '../public/js/ejshelpers/userLR.js';

const router = express.Router();


export default router;
const user = {
    name: 'emma',
    age: 'joy'
}

router.get('/', (req, res) => {
    res.render('partials/mainpage');
});
router.get('/about', (req, res) => {
    res.render('partials/about')
})
router.get('/login', (req, res) => {
    res.render('partials/login', {logIn: 'false', dynamicHeader
    })
});
router.get('/register', (req, res) => {
    res.render('partials/register')
})