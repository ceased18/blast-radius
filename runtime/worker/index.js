import {createApp} from '../src/api.mjs';
import {ASSETS} from '../src/generated_assets.mjs';
// Immutable approved public build content; no request state.
const app=createApp({assets:ASSETS});
export default {async fetch(request,env,ctx){return app.fetch(request,env,ctx);}};
