import express, { Router } from 'express';
const router = express.Router();

export default router;

router.get('/', (req, res) => {
    res.render('partials/mainpage');
});
router.get('/about', (req, res) => {
    res.render('partials/about')
})
router.get('/login', (req, res) => {
    res.render('partials/login')
});
router.get('/register', (req, res) => {
    res.render('partials/register')
})