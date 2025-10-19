import express from 'express'
import expressEjsLayouts from 'express-ejs-layouts'
import mainpageRouter from './controller/mainpage.js'
const app = express()
const port = 3000


app.set('view engine', 'ejs')
app.set('views', '__dirname + views')
app.set('layout', 'layouts/brokertemplate')
app.use(expressEjsLayouts)
app.use(express.static('public'))
app.use('/', mainpageRouter)

app.listen(port, () => {console.log('up and running')})
 