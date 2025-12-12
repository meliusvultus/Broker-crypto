import express from 'express';
import expressEjsLayouts from 'express-ejs-layouts';
import mainpageRouter from './controller/mainpage.js';
import path from 'path';

const app = express();
const port = 3000;


app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.set('layout', 'layouts/brokertemplate');
app.use(expressEjsLayouts);
app.use(express.static(path.join(process.cwd(),'public')));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use('/', mainpageRouter);

app.listen(port, () => {console.log('up and running')});
console.log(path.join(process.cwd(), 'public'));