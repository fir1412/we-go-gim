import {launch} from '../tests/e2e/browser.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const b=await launch();try{await b.send('Emulation.setDeviceMetricsOverride',{width:460,height:1040,deviceScaleFactor:1,mobile:false});await b.go('mockups/welcome.html');const {data}=await b.send('Page.captureScreenshot',{format:'png'});mkdirSync('output/mockups',{recursive:true});writeFileSync('output/mockups/welcome.png',Buffer.from(data,'base64'));}finally{await b.close();}
