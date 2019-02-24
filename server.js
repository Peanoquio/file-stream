const express = require('express');
const cors = require('cors');
const ip = require('ip');
const bodyParser = require('body-parser');

const router = require('./router');

const app = express();
const PORT = 3001;

// parses the text as JSON and exposes the resulting object on req.body.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// cross-origin support only for this origin
// NOTE: this is because the Ajax jQuery appends [Access-Control-Request-Headers: x-requested-with]  to the request
// So this is similar to allowing [Access-Control-Allow-Headers: x-requested-with] but only for this origin
app.use(cors());
const corsOptions = {
    origin: `http://${ip.address()}:${PORT}`
};
app.options('/', cors(corsOptions)); // enable pre-flight request

// router to handle REST
app.use('/', router);

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});
