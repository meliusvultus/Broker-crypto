import express, { Router } from 'express';
const router = express.Router();

export default router;

router.get('/', (req, res) => {
    res.render('mainpage');});
router.get('/about', (req, res) => {
})