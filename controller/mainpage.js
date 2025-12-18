import express, { Router } from 'express';
import auth from './auth/auth.js'
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

router.get('/auth', (req, res) => {
    res.render('partials/auth')
})
