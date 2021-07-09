const express = require('express');
const BehaviorSubject = require('rxjs').BehaviorSubject;
const interval = require('rxjs').interval;

const app = express();

const possibleServiceStates = { START: "start", STOP: "stop", PAUSE: "pause", STATUS: "status" }
app.locals.serviceState$ = new BehaviorSubject(possibleServiceStates.START);

const nodeId = process.env.nodeId || "foo";

const genValueFrom = (min = 44, toMax = 55) => {
    return Math.floor(Math.random() * (toMax - min + 1)) + min;
}

let delay = 5000;
let randomTime = genValueFrom(1, 10) * delay;

// Flip flops between start and pause states.
// Start state has to be explicitly set after stop is set.
interval(randomTime).subscribe(() => {

    switch (app.locals.serviceState$.value) {
        case possibleServiceStates.START:
            app.locals.serviceState$.next(possibleServiceStates.PAUSE);
            break;
        case possibleServiceStates.PAUSE:
            app.locals.serviceState$.next(possibleServiceStates.START);
            break;
        case possibleServiceStates.STOP:
            app.locals.serviceState$.next(possibleServiceStates.STOP);
            break;
    }
    // Reset timer - bug only works on server restart
    randomTime = genValueFrom(1, 10) * delay;
    console.log(`Flipping service state. Random time is ${randomTime / 1000} seconds with state of: ${app.locals.serviceState$.value}`);
});

// response header for sse
const SSE_RESPONSE_HEADER = {
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*' // Bad practice 
};

// emits sse
app.get('/meters/emits', function (req, res) {

    // Writes response header.
    res.writeHead(200, SSE_RESPONSE_HEADER);
    let id = 0;

    const emitter = interval(1000).subscribe(() => {
        console.log(`Current service state is: ${app.locals.serviceState$.value}`);

        app.locals.serviceState$.subscribe(state => {

            if (app.locals.serviceState$.value === possibleServiceStates.STOP) {
                console.log("Closing connection.");
                res.socket.end();
            }
        });
        if (app.locals.serviceState$.value === possibleServiceStates.PAUSE) {
            res.write(`:\n`);
        }
        else {
            res.write(`id: ${++id}\n`);
            res.write('event: reading\n');
            res.write(`data: ${JSON.stringify({ nodeId, reading: genValueFrom() })}\n`);
        }
    });

    req.on("close", () => {
        console.log("Connection closed, cleaning up.");
        res.write(`event: userdisconnect`);
        emitter.unsubscribe();
    });
});

app.get('/services/:state', (req, res) => {
    
    const stateExists = Object.values(possibleServiceStates).filter(state => state === req.params['state']).pop()
    if (stateExists !== possibleServiceStates.STATUS) {
        app.locals.serviceState$.next(stateExists);
    }
    res.setHeader('Access-Control-Allow-Origin', '*').status(200).json({data: { nodeId, 'status': app.locals.serviceState$.value }});
});

app.listen(3000);
