"use strict";var Ps=Object.create;var ue=Object.defineProperty;var Ms=Object.getOwnPropertyDescriptor;var Rs=Object.getOwnPropertyNames;var Ds=Object.getPrototypeOf,Ns=Object.prototype.hasOwnProperty;var qs=(t,e)=>()=>(t&&(e=t(t=0)),e);var m=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports),qt=(t,e)=>{for(var r in e)ue(t,r,{get:e[r],enumerable:!0})},Lt=(t,e,r,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Rs(e))!Ns.call(t,n)&&n!==r&&ue(t,n,{get:()=>e[n],enumerable:!(s=Ms(e,n))||s.enumerable});return t};var P=(t,e,r)=>(r=t!=null?Ps(Ds(t)):{},Lt(e||!t||!t.__esModule?ue(r,"default",{value:t,enumerable:!0}):r,t)),Ot=t=>Lt(ue({},"__esModule",{value:!0}),t);var De=m(Bt=>{"use strict";Bt.parse=function(t,e){return new Re(t,e).parse()};var Re=class t{constructor(e,r){this.source=e,this.transform=r||Ls,this.position=0,this.entries=[],this.recorded=[],this.dimension=0}isEof(){return this.position>=this.source.length}nextCharacter(){var e=this.source[this.position++];return e==="\\"?{value:this.source[this.position++],escaped:!0}:{value:e,escaped:!1}}record(e){this.recorded.push(e)}newEntry(e){var r;(this.recorded.length>0||e)&&(r=this.recorded.join(""),r==="NULL"&&!e&&(r=null),r!==null&&(r=this.transform(r)),this.entries.push(r),this.recorded=[])}consumeDimensions(){if(this.source[0]==="[")for(;!this.isEof();){var e=this.nextCharacter();if(e.value==="=")break}}parse(e){var r,s,n;for(this.consumeDimensions();!this.isEof();)if(r=this.nextCharacter(),r.value==="{"&&!n)this.dimension++,this.dimension>1&&(s=new t(this.source.substr(this.position-1),this.transform),this.entries.push(s.parse(!0)),this.position+=s.position-2);else if(r.value==="}"&&!n){if(this.dimension--,!this.dimension&&(this.newEntry(),e))return this.entries}else r.value==='"'&&!r.escaped?(n&&this.newEntry(!0),n=!n):r.value===","&&!n?this.newEntry():this.record(r.value);if(this.dimension!==0)throw new Error("array dimension not balanced");return this.entries}};function Ls(t){return t}});var Ne=m((Ki,Ft)=>{var Os=De();Ft.exports={create:function(t,e){return{parse:function(){return Os.parse(t,e)}}}}});var Ht=m((zi,Ut)=>{"use strict";var Bs=/(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/,Fs=/^(\d{1,})-(\d{2})-(\d{2})( BC)?$/,Qs=/([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/,Us=/^-?infinity$/;Ut.exports=function(e){if(Us.test(e))return Number(e.replace("i","I"));var r=Bs.exec(e);if(!r)return Hs(e)||null;var s=!!r[8],n=parseInt(r[1],10);s&&(n=Qt(n));var o=parseInt(r[2],10)-1,i=r[3],a=parseInt(r[4],10),l=parseInt(r[5],10),c=parseInt(r[6],10),d=r[7];d=d?1e3*parseFloat(d):0;var h,p=$s(e);return p!=null?(h=new Date(Date.UTC(n,o,i,a,l,c,d)),qe(n)&&h.setUTCFullYear(n),p!==0&&h.setTime(h.getTime()-p)):(h=new Date(n,o,i,a,l,c,d),qe(n)&&h.setFullYear(n)),h};function Hs(t){var e=Fs.exec(t);if(e){var r=parseInt(e[1],10),s=!!e[4];s&&(r=Qt(r));var n=parseInt(e[2],10)-1,o=e[3],i=new Date(r,n,o);return qe(r)&&i.setFullYear(r),i}}function $s(t){if(t.endsWith("+00"))return 0;var e=Qs.exec(t.split(" ")[1]);if(e){var r=e[1];if(r==="Z")return 0;var s=r==="-"?-1:1,n=parseInt(e[2],10)*3600+parseInt(e[3]||0,10)*60+parseInt(e[4]||0,10);return n*s*1e3}}function Qt(t){return-(t-1)}function qe(t){return t>=0&&t<100}});var jt=m((Yi,$t)=>{$t.exports=Vs;var js=Object.prototype.hasOwnProperty;function Vs(t){for(var e=1;e<arguments.length;e++){var r=arguments[e];for(var s in r)js.call(r,s)&&(t[s]=r[s])}return t}});var Gt=m((Ji,Wt)=>{"use strict";var Ws=jt();Wt.exports=F;function F(t){if(!(this instanceof F))return new F(t);Ws(this,nn(t))}var Gs=["seconds","minutes","hours","days","months","years"];F.prototype.toPostgres=function(){var t=Gs.filter(this.hasOwnProperty,this);return this.milliseconds&&t.indexOf("seconds")<0&&t.push("seconds"),t.length===0?"0":t.map(function(e){var r=this[e]||0;return e==="seconds"&&this.milliseconds&&(r=(r+this.milliseconds/1e3).toFixed(6).replace(/\.?0+$/,"")),r+" "+e},this).join(" ")};var Ks={years:"Y",months:"M",days:"D",hours:"H",minutes:"M",seconds:"S"},zs=["years","months","days"],Ys=["hours","minutes","seconds"];F.prototype.toISOString=F.prototype.toISO=function(){var t=zs.map(r,this).join(""),e=Ys.map(r,this).join("");return"P"+t+"T"+e;function r(s){var n=this[s]||0;return s==="seconds"&&this.milliseconds&&(n=(n+this.milliseconds/1e3).toFixed(6).replace(/0+$/,"")),n+Ks[s]}};var Le="([+-]?\\d+)",Js=Le+"\\s+years?",Zs=Le+"\\s+mons?",Xs=Le+"\\s+days?",en="([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?",tn=new RegExp([Js,Zs,Xs,en].map(function(t){return"("+t+")?"}).join("\\s*")),Vt={years:2,months:4,days:6,hours:9,minutes:10,seconds:11,milliseconds:12},rn=["hours","minutes","seconds","milliseconds"];function sn(t){var e=t+"000000".slice(t.length);return parseInt(e,10)/1e3}function nn(t){if(!t)return{};var e=tn.exec(t),r=e[8]==="-";return Object.keys(Vt).reduce(function(s,n){var o=Vt[n],i=e[o];return!i||(i=n==="milliseconds"?sn(i):parseInt(i,10),!i)||(r&&~rn.indexOf(n)&&(i*=-1),s[n]=i),s},{})}});var zt=m((Zi,Kt)=>{"use strict";Kt.exports=function(e){if(/^\\x/.test(e))return new Buffer(e.substr(2),"hex");for(var r="",s=0;s<e.length;)if(e[s]!=="\\")r+=e[s],++s;else if(/[0-7]{3}/.test(e.substr(s+1,3)))r+=String.fromCharCode(parseInt(e.substr(s+1,3),8)),s+=4;else{for(var n=1;s+n<e.length&&e[s+n]==="\\";)n++;for(var o=0;o<Math.floor(n/2);++o)r+="\\";s+=Math.floor(n/2)*2}return new Buffer(r,"binary")}});var rr=m((Xi,tr)=>{var z=De(),Y=Ne(),de=Ht(),Jt=Gt(),Zt=zt();function he(t){return function(r){return r===null?r:t(r)}}function Xt(t){return t===null?t:t==="TRUE"||t==="t"||t==="true"||t==="y"||t==="yes"||t==="on"||t==="1"}function on(t){return t?z.parse(t,Xt):null}function an(t){return parseInt(t,10)}function Oe(t){return t?z.parse(t,he(an)):null}function cn(t){return t?z.parse(t,he(function(e){return er(e).trim()})):null}var ln=function(t){if(!t)return null;var e=Y.create(t,function(r){return r!==null&&(r=Ue(r)),r});return e.parse()},Be=function(t){if(!t)return null;var e=Y.create(t,function(r){return r!==null&&(r=parseFloat(r)),r});return e.parse()},T=function(t){if(!t)return null;var e=Y.create(t);return e.parse()},Fe=function(t){if(!t)return null;var e=Y.create(t,function(r){return r!==null&&(r=de(r)),r});return e.parse()},un=function(t){if(!t)return null;var e=Y.create(t,function(r){return r!==null&&(r=Jt(r)),r});return e.parse()},dn=function(t){return t?z.parse(t,he(Zt)):null},Qe=function(t){return parseInt(t,10)},er=function(t){var e=String(t);return/^\d+$/.test(e)?e:t},Yt=function(t){return t?z.parse(t,he(JSON.parse)):null},Ue=function(t){return t[0]!=="("?null:(t=t.substring(1,t.length-1).split(","),{x:parseFloat(t[0]),y:parseFloat(t[1])})},hn=function(t){if(t[0]!=="<"&&t[1]!=="(")return null;for(var e="(",r="",s=!1,n=2;n<t.length-1;n++){if(s||(e+=t[n]),t[n]===")"){s=!0;continue}else if(!s)continue;t[n]!==","&&(r+=t[n])}var o=Ue(e);return o.radius=parseFloat(r),o},pn=function(t){t(20,er),t(21,Qe),t(23,Qe),t(26,Qe),t(700,parseFloat),t(701,parseFloat),t(16,Xt),t(1082,de),t(1114,de),t(1184,de),t(600,Ue),t(651,T),t(718,hn),t(1e3,on),t(1001,dn),t(1005,Oe),t(1007,Oe),t(1028,Oe),t(1016,cn),t(1017,ln),t(1021,Be),t(1022,Be),t(1231,Be),t(1014,T),t(1015,T),t(1008,T),t(1009,T),t(1040,T),t(1041,T),t(1115,Fe),t(1182,Fe),t(1185,Fe),t(1186,Jt),t(1187,un),t(17,Zt),t(114,JSON.parse.bind(JSON)),t(3802,JSON.parse.bind(JSON)),t(199,Yt),t(3807,Yt),t(3907,T),t(2951,T),t(791,T),t(1183,T),t(1270,T)};tr.exports={init:pn}});var nr=m((ea,sr)=>{"use strict";var C=1e6;function fn(t){var e=t.readInt32BE(0),r=t.readUInt32BE(4),s="";e<0&&(e=~e+(r===0),r=~r+1>>>0,s="-");var n="",o,i,a,l,c,d;{if(o=e%C,e=e/C>>>0,i=4294967296*o+r,r=i/C>>>0,a=""+(i-C*r),r===0&&e===0)return s+a+n;for(l="",c=6-a.length,d=0;d<c;d++)l+="0";n=l+a+n}{if(o=e%C,e=e/C>>>0,i=4294967296*o+r,r=i/C>>>0,a=""+(i-C*r),r===0&&e===0)return s+a+n;for(l="",c=6-a.length,d=0;d<c;d++)l+="0";n=l+a+n}{if(o=e%C,e=e/C>>>0,i=4294967296*o+r,r=i/C>>>0,a=""+(i-C*r),r===0&&e===0)return s+a+n;for(l="",c=6-a.length,d=0;d<c;d++)l+="0";n=l+a+n}return o=e%C,i=4294967296*o+r,a=""+i%C,s+a+n}sr.exports=fn});var lr=m((ta,cr)=>{var mn=nr(),y=function(t,e,r,s,n){r=r||0,s=s||!1,n=n||function(w,K,Me){return w*Math.pow(2,Me)+K};var o=r>>3,i=function(w){return s?~w&255:w},a=255,l=8-r%8;e<l&&(a=255<<8-e&255,l=e),r&&(a=a>>r%8);var c=0;r%8+e>=8&&(c=n(0,i(t[o])&a,l));for(var d=e+r>>3,h=o+1;h<d;h++)c=n(c,i(t[h]),8);var p=(e+r)%8;return p>0&&(c=n(c,i(t[d])>>8-p,p)),c},ar=function(t,e,r){var s=Math.pow(2,r-1)-1,n=y(t,1),o=y(t,r,1);if(o===0)return 0;var i=1,a=function(c,d,h){c===0&&(c=1);for(var p=1;p<=h;p++)i/=2,(d&1<<h-p)>0&&(c+=i);return c},l=y(t,e,r+1,!1,a);return o==Math.pow(2,r+1)-1?l===0?n===0?1/0:-1/0:NaN:(n===0?1:-1)*Math.pow(2,o-s)*l},vn=function(t){return y(t,1)==1?-1*(y(t,15,1,!0)+1):y(t,15,1)},or=function(t){return y(t,1)==1?-1*(y(t,31,1,!0)+1):y(t,31,1)},yn=function(t){return ar(t,23,8)},gn=function(t){return ar(t,52,11)},bn=function(t){var e=y(t,16,32);if(e==49152)return NaN;for(var r=Math.pow(1e4,y(t,16,16)),s=0,n=[],o=y(t,16),i=0;i<o;i++)s+=y(t,16,64+16*i)*r,r/=1e4;var a=Math.pow(10,y(t,16,48));return(e===0?1:-1)*Math.round(s*a)/a},ir=function(t,e){var r=y(e,1),s=y(e,63,1),n=new Date((r===0?1:-1)*s/1e3+9466848e5);return t||n.setTime(n.getTime()+n.getTimezoneOffset()*6e4),n.usec=s%1e3,n.getMicroSeconds=function(){return this.usec},n.setMicroSeconds=function(o){this.usec=o},n.getUTCMicroSeconds=function(){return this.usec},n},J=function(t){for(var e=y(t,32),r=y(t,32,32),s=y(t,32,64),n=96,o=[],i=0;i<e;i++)o[i]=y(t,32,n),n+=32,n+=32;var a=function(c){var d=y(t,32,n);if(n+=32,d==4294967295)return null;var h;if(c==23||c==20)return h=y(t,d*8,n),n+=d*8,h;if(c==25)return h=t.toString(this.encoding,n>>3,(n+=d<<3)>>3),h;console.log("ERROR: ElementType not implemented: "+c)},l=function(c,d){var h=[],p;if(c.length>1){var w=c.shift();for(p=0;p<w;p++)h[p]=l(c,d);c.unshift(w)}else for(p=0;p<c[0];p++)h[p]=a(d);return h};return l(o,s)},wn=function(t){return t.toString("utf8")},_n=function(t){return t===null?null:y(t,8)>0},Sn=function(t){t(20,mn),t(21,vn),t(23,or),t(26,or),t(1700,bn),t(700,yn),t(701,gn),t(16,_n),t(1114,ir.bind(null,!1)),t(1184,ir.bind(null,!0)),t(1e3,J),t(1007,J),t(1016,J),t(1008,J),t(1009,J),t(25,wn)};cr.exports={init:Sn}});var dr=m((ra,ur)=>{ur.exports={BOOL:16,BYTEA:17,CHAR:18,INT8:20,INT2:21,INT4:23,REGPROC:24,TEXT:25,OID:26,TID:27,XID:28,CID:29,JSON:114,XML:142,PG_NODE_TREE:194,SMGR:210,PATH:602,POLYGON:604,CIDR:650,FLOAT4:700,FLOAT8:701,ABSTIME:702,RELTIME:703,TINTERVAL:704,CIRCLE:718,MACADDR8:774,MONEY:790,MACADDR:829,INET:869,ACLITEM:1033,BPCHAR:1042,VARCHAR:1043,DATE:1082,TIME:1083,TIMESTAMP:1114,TIMESTAMPTZ:1184,INTERVAL:1186,TIMETZ:1266,BIT:1560,VARBIT:1562,NUMERIC:1700,REFCURSOR:1790,REGPROCEDURE:2202,REGOPER:2203,REGOPERATOR:2204,REGCLASS:2205,REGTYPE:2206,UUID:2950,TXID_SNAPSHOT:2970,PG_LSN:3220,PG_NDISTINCT:3361,PG_DEPENDENCIES:3402,TSVECTOR:3614,TSQUERY:3615,GTSVECTOR:3642,REGCONFIG:3734,REGDICTIONARY:3769,JSONB:3802,REGNAMESPACE:4089,REGROLE:4096}});var ee=m(X=>{var En=rr(),Cn=lr(),xn=Ne(),kn=dr();X.getTypeParser=Tn;X.setTypeParser=In;X.arrayParser=xn;X.builtins=kn;var Z={text:{},binary:{}};function hr(t){return String(t)}function Tn(t,e){return e=e||"text",Z[e]&&Z[e][t]||hr}function In(t,e,r){typeof e=="function"&&(r=e,e="text"),Z[e][t]=r}En.init(function(t,e){Z.text[t]=e});Cn.init(function(t,e){Z.binary[t]=e})});var te=m((na,He)=>{"use strict";He.exports={host:"localhost",user:process.platform==="win32"?process.env.USERNAME:process.env.USER,database:void 0,password:null,connectionString:void 0,port:5432,rows:0,binary:!1,max:10,idleTimeoutMillis:3e4,client_encoding:"",ssl:!1,application_name:void 0,fallback_application_name:void 0,options:void 0,parseInputDatesAsUTC:!1,statement_timeout:!1,lock_timeout:!1,idle_in_transaction_session_timeout:!1,query_timeout:!1,connect_timeout:0,keepalives:1,keepalives_idle:0};var Q=ee(),An=Q.getTypeParser(20,"text"),Pn=Q.getTypeParser(1016,"text");He.exports.__defineSetter__("parseInt8",function(t){Q.setTypeParser(20,"text",t?Q.getTypeParser(23,"text"):An),Q.setTypeParser(1016,"text",t?Q.getTypeParser(1007,"text"):Pn)})});var re=m((oa,fr)=>{"use strict";var Mn=te();function Rn(t){var e=t.replace(/\\/g,"\\\\").replace(/"/g,'\\"');return'"'+e+'"'}function pr(t){for(var e="{",r=0;r<t.length;r++)if(r>0&&(e=e+","),t[r]===null||typeof t[r]>"u")e=e+"NULL";else if(Array.isArray(t[r]))e=e+pr(t[r]);else if(ArrayBuffer.isView(t[r])){var s=t[r];if(!(s instanceof Buffer)){var n=Buffer.from(s.buffer,s.byteOffset,s.byteLength);n.length===s.byteLength?s=n:s=n.slice(s.byteOffset,s.byteOffset+s.byteLength)}e+="\\\\x"+s.toString("hex")}else e+=Rn(pe(t[r]));return e=e+"}",e}var pe=function(t,e){if(t==null)return null;if(typeof t=="object"){if(t instanceof Buffer)return t;if(ArrayBuffer.isView(t)){var r=Buffer.from(t.buffer,t.byteOffset,t.byteLength);return r.length===t.byteLength?r:r.slice(t.byteOffset,t.byteOffset+t.byteLength)}return t instanceof Date?Mn.parseInputDatesAsUTC?qn(t):Nn(t):Array.isArray(t)?pr(t):Dn(t,e)}return t.toString()};function Dn(t,e){if(t&&typeof t.toPostgres=="function"){if(e=e||[],e.indexOf(t)!==-1)throw new Error('circular reference detected while preparing "'+t+'" for query');return e.push(t),pe(t.toPostgres(pe),e)}return JSON.stringify(t)}function Nn(t){var e=-t.getTimezoneOffset(),r=t.getFullYear(),s=r<1;s&&(r=Math.abs(r)+1);var n=String(r).padStart(4,"0")+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0")+"T"+String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0")+":"+String(t.getSeconds()).padStart(2,"0")+"."+String(t.getMilliseconds()).padStart(3,"0");return e<0?(n+="-",e*=-1):n+="+",n+=String(Math.floor(e/60)).padStart(2,"0")+":"+String(e%60).padStart(2,"0"),s&&(n+=" BC"),n}function qn(t){var e=t.getUTCFullYear(),r=e<1;r&&(e=Math.abs(e)+1);var s=String(e).padStart(4,"0")+"-"+String(t.getUTCMonth()+1).padStart(2,"0")+"-"+String(t.getUTCDate()).padStart(2,"0")+"T"+String(t.getUTCHours()).padStart(2,"0")+":"+String(t.getUTCMinutes()).padStart(2,"0")+":"+String(t.getUTCSeconds()).padStart(2,"0")+"."+String(t.getUTCMilliseconds()).padStart(3,"0");return s+="+00:00",r&&(s+=" BC"),s}function Ln(t,e,r){return t=typeof t=="string"?{text:t}:t,e&&(typeof e=="function"?t.callback=e:t.values=e),r&&(t.callback=r),t}var On=function(t){return'"'+t.replace(/"/g,'""')+'"'},Bn=function(t){for(var e=!1,r="'",s=0;s<t.length;s++){var n=t[s];n==="'"?r+=n+n:n==="\\"?(r+=n+n,e=!0):r+=n}return r+="'",e===!0&&(r=" E"+r),r};fr.exports={prepareValue:function(e){return pe(e)},normalizeQueryConfig:Ln,escapeIdentifier:On,escapeLiteral:Bn}});var vr=m((ia,mr)=>{"use strict";var U=require("crypto");function $e(t){return U.createHash("md5").update(t,"utf-8").digest("hex")}function Fn(t,e,r){var s=$e(e+t),n=$e(Buffer.concat([Buffer.from(s),r]));return"md5"+n}function Qn(t){return U.createHash("sha256").update(t).digest()}function Un(t,e){return t=t.replace(/(\D)-/,"$1"),U.createHash(t).update(e).digest()}function Hn(t,e){return U.createHmac("sha256",t).update(e).digest()}async function $n(t,e,r){return U.pbkdf2Sync(t,e,r,32,"sha256")}mr.exports={postgresMd5PasswordHash:Fn,randomBytes:U.randomBytes,deriveKey:$n,sha256:Qn,hashByName:Un,hmacSha256:Hn,md5:$e}});var wr=m((aa,br)=>{var yr=require("crypto");br.exports={postgresMd5PasswordHash:Vn,randomBytes:jn,deriveKey:zn,sha256:Wn,hashByName:Gn,hmacSha256:Kn,md5:je};var gr=yr.webcrypto||globalThis.crypto,O=gr.subtle,Ve=new TextEncoder;function jn(t){return gr.getRandomValues(Buffer.alloc(t))}async function je(t){try{return yr.createHash("md5").update(t,"utf-8").digest("hex")}catch{let r=typeof t=="string"?Ve.encode(t):t,s=await O.digest("MD5",r);return Array.from(new Uint8Array(s)).map(n=>n.toString(16).padStart(2,"0")).join("")}}async function Vn(t,e,r){var s=await je(e+t),n=await je(Buffer.concat([Buffer.from(s),r]));return"md5"+n}async function Wn(t){return await O.digest("SHA-256",t)}async function Gn(t,e){return await O.digest(t,e)}async function Kn(t,e){let r=await O.importKey("raw",t,{name:"HMAC",hash:"SHA-256"},!1,["sign"]);return await O.sign("HMAC",r,Ve.encode(e))}async function zn(t,e,r){let s=await O.importKey("raw",Ve.encode(t),"PBKDF2",!1,["deriveBits"]),n={name:"PBKDF2",hash:"SHA-256",salt:e,iterations:r};return await O.deriveBits(n,s,32*8,["deriveBits"])}});var Ge=m((ca,We)=>{"use strict";var Yn=parseInt(process.versions&&process.versions.node&&process.versions.node.split(".")[0])<15;Yn?We.exports=vr():We.exports=wr()});var Er=m((la,Sr)=>{function B(t,e){throw new Error("SASL channel binding: "+t+" when parsing public certificate "+e.toString("base64"))}function Ke(t,e){let r=t[e++];if(r<128)return{length:r,index:e};let s=r&127;s>4&&B("bad length",t),r=0;for(let n=0;n<s;n++)r=r<<8|t[e++];return{length:r,index:e}}function _r(t,e){t[e++]!==6&&B("non-OID data",t);let{length:r,index:s}=Ke(t,e);e=s,lastIndex=e+r;let n=t[e++],o=(n/40>>0)+"."+n%40;for(;e<lastIndex;){let i=0;for(;e<lastIndex;){let a=t[e++];if(i=i<<7|a&127,a<128)break}o+="."+i}return{oid:o,index:e}}function se(t,e){return t[e++]!==48&&B("non-sequence data",t),Ke(t,e)}function Jn(t,e){e===void 0&&(e=0),e=se(t,e).index;let{length:r,index:s}=se(t,e);e=s+r,e=se(t,e).index;let{oid:n,index:o}=_r(t,e);switch(n){case"1.2.840.113549.1.1.4":return"MD5";case"1.2.840.113549.1.1.5":return"SHA-1";case"1.2.840.113549.1.1.11":return"SHA-256";case"1.2.840.113549.1.1.12":return"SHA-384";case"1.2.840.113549.1.1.13":return"SHA-512";case"1.2.840.113549.1.1.14":return"SHA-224";case"1.2.840.113549.1.1.15":return"SHA512-224";case"1.2.840.113549.1.1.16":return"SHA512-256";case"1.2.840.10045.4.1":return"SHA-1";case"1.2.840.10045.4.3.1":return"SHA-224";case"1.2.840.10045.4.3.2":return"SHA-256";case"1.2.840.10045.4.3.3":return"SHA-384";case"1.2.840.10045.4.3.4":return"SHA-512";case"1.2.840.113549.1.1.10":e=o,e=se(t,e).index,t[e++]!==160&&B("non-tag data",t),e=Ke(t,e).index,e=se(t,e).index;let{oid:i}=_r(t,e);switch(i){case"1.2.840.113549.2.5":return"MD5";case"1.3.14.3.2.26":return"SHA-1";case"2.16.840.1.101.3.4.2.1":return"SHA-256";case"2.16.840.1.101.3.4.2.2":return"SHA-384";case"2.16.840.1.101.3.4.2.3":return"SHA-512"}B("unknown hash OID "+i,t);case"1.3.101.110":case"1.3.101.112":return"SHA-512";case"1.3.101.111":case"1.3.101.113":B("Ed448 certificate channel binding is not currently supported by Postgres")}B("unknown OID "+n,t)}Sr.exports={signatureAlgorithmHashFromCertificate:Jn}});var Tr=m((ua,kr)=>{"use strict";var N=Ge(),{signatureAlgorithmHashFromCertificate:Zn}=Er();function Xn(t,e){let r=["SCRAM-SHA-256"];e&&r.unshift("SCRAM-SHA-256-PLUS");let s=r.find(i=>t.includes(i));if(!s)throw new Error("SASL: Only mechanism(s) "+r.join(" and ")+" are supported");if(s==="SCRAM-SHA-256-PLUS"&&typeof e.getPeerCertificate!="function")throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");let n=N.randomBytes(18).toString("base64");return{mechanism:s,clientNonce:n,response:(s==="SCRAM-SHA-256-PLUS"?"p=tls-server-end-point":e?"y":"n")+",,n=*,r="+n,message:"SASLInitialResponse"}}async function eo(t,e,r,s){if(t.message!=="SASLInitialResponse")throw new Error("SASL: Last message was not SASLInitialResponse");if(typeof e!="string")throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");if(e==="")throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");if(typeof r!="string")throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");let n=so(r);if(n.nonce.startsWith(t.clientNonce)){if(n.nonce.length===t.clientNonce.length)throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short")}else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");var o="n=*,r="+t.clientNonce,i="r="+n.nonce+",s="+n.salt+",i="+n.iteration;let a=s?"eSws":"biws";if(t.mechanism==="SCRAM-SHA-256-PLUS"){let Nt=s.getPeerCertificate().raw,le=Zn(Nt);(le==="MD5"||le==="SHA-1")&&(le="SHA-256");let As=await N.hashByName(le,Nt);a=Buffer.concat([Buffer.from("p=tls-server-end-point,,"),Buffer.from(As)]).toString("base64")}var l="c="+a+",r="+n.nonce,c=o+","+i+","+l,d=Buffer.from(n.salt,"base64"),h=await N.deriveKey(e,d,n.iteration),p=await N.hmacSha256(h,"Client Key"),w=await N.sha256(p),K=await N.hmacSha256(w,c),Me=oo(Buffer.from(p),Buffer.from(K)).toString("base64"),Ts=await N.hmacSha256(h,"Server Key"),Is=await N.hmacSha256(Ts,c);t.message="SASLResponse",t.serverSignature=Buffer.from(Is).toString("base64"),t.response=l+",p="+Me}function to(t,e){if(t.message!=="SASLResponse")throw new Error("SASL: Last message was not SASLResponse");if(typeof e!="string")throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");let{serverSignature:r}=no(e);if(r!==t.serverSignature)throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match")}function ro(t){if(typeof t!="string")throw new TypeError("SASL: text must be a string");return t.split("").map((e,r)=>t.charCodeAt(r)).every(e=>e>=33&&e<=43||e>=45&&e<=126)}function Cr(t){return/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(t)}function xr(t){if(typeof t!="string")throw new TypeError("SASL: attribute pairs text must be a string");return new Map(t.split(",").map(e=>{if(!/^.=/.test(e))throw new Error("SASL: Invalid attribute pair entry");let r=e[0],s=e.substring(2);return[r,s]}))}function so(t){let e=xr(t),r=e.get("r");if(r){if(!ro(r))throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters")}else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");let s=e.get("s");if(s){if(!Cr(s))throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64")}else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");let n=e.get("i");if(n){if(!/^[1-9][0-9]*$/.test(n))throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count")}else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");let o=parseInt(n,10);return{nonce:r,salt:s,iteration:o}}function no(t){let r=xr(t).get("v");if(r){if(!Cr(r))throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64")}else throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");return{serverSignature:r}}function oo(t,e){if(!Buffer.isBuffer(t))throw new TypeError("first argument must be a Buffer");if(!Buffer.isBuffer(e))throw new TypeError("second argument must be a Buffer");if(t.length!==e.length)throw new Error("Buffer lengths must match");if(t.length===0)throw new Error("Buffers cannot be empty");return Buffer.from(t.map((r,s)=>t[s]^e[s]))}kr.exports={startSession:Xn,continueSession:eo,finalizeSession:to}});var ze=m((da,Ir)=>{"use strict";var io=ee();function fe(t){this._types=t||io,this.text={},this.binary={}}fe.prototype.getOverrides=function(t){switch(t){case"text":return this.text;case"binary":return this.binary;default:return{}}};fe.prototype.setTypeParser=function(t,e,r){typeof e=="function"&&(r=e,e="text"),this.getOverrides(e)[t]=r};fe.prototype.getTypeParser=function(t,e){return e=e||"text",this.getOverrides(e)[t]||this._types.getTypeParser(t,e)};Ir.exports=fe});var Pr=m((ha,Ar)=>{"use strict";function Ye(t){if(t.charAt(0)==="/"){let a=t.split(" ");return{host:a[0],database:a[1]}}let e={},r,s=!1;/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(t)&&(t=encodeURI(t).replace(/\%25(\d\d)/g,"%$1"));try{r=new URL(t,"postgres://base")}catch{r=new URL(t.replace("@/","@___DUMMY___/"),"postgres://base"),s=!0}for(let a of r.searchParams.entries())e[a[0]]=a[1];if(e.user=e.user||decodeURIComponent(r.username),e.password=e.password||decodeURIComponent(r.password),r.protocol=="socket:")return e.host=decodeURI(r.pathname),e.database=r.searchParams.get("db"),e.client_encoding=r.searchParams.get("encoding"),e;let n=s?"":r.hostname;e.host?n&&/^%2f/i.test(n)&&(r.pathname=n+r.pathname):e.host=decodeURIComponent(n),e.port||(e.port=r.port);let o=r.pathname.slice(1)||null;e.database=o?decodeURI(o):null,(e.ssl==="true"||e.ssl==="1")&&(e.ssl=!0),e.ssl==="0"&&(e.ssl=!1),(e.sslcert||e.sslkey||e.sslrootcert||e.sslmode)&&(e.ssl={});let i=e.sslcert||e.sslkey||e.sslrootcert?require("fs"):null;switch(e.sslcert&&(e.ssl.cert=i.readFileSync(e.sslcert).toString()),e.sslkey&&(e.ssl.key=i.readFileSync(e.sslkey).toString()),e.sslrootcert&&(e.ssl.ca=i.readFileSync(e.sslrootcert).toString()),e.sslmode){case"disable":{e.ssl=!1;break}case"prefer":case"require":case"verify-ca":case"verify-full":break;case"no-verify":{e.ssl.rejectUnauthorized=!1;break}}return e}Ar.exports=Ye;Ye.parse=Ye});var Ze=m((pa,Dr)=>{"use strict";var ao=require("dns"),Rr=te(),Mr=Pr().parse,E=function(t,e,r){return r===void 0?r=process.env["PG"+t.toUpperCase()]:r===!1||(r=process.env[r]),e[t]||r||Rr[t]},co=function(){switch(process.env.PGSSLMODE){case"disable":return!1;case"prefer":case"require":case"verify-ca":case"verify-full":return!0;case"no-verify":return{rejectUnauthorized:!1}}return Rr.ssl},H=function(t){return"'"+(""+t).replace(/\\/g,"\\\\").replace(/'/g,"\\'")+"'"},I=function(t,e,r){var s=e[r];s!=null&&t.push(r+"="+H(s))},Je=class{constructor(e){e=typeof e=="string"?Mr(e):e||{},e.connectionString&&(e=Object.assign({},e,Mr(e.connectionString))),this.user=E("user",e),this.database=E("database",e),this.database===void 0&&(this.database=this.user),this.port=parseInt(E("port",e),10),this.host=E("host",e),Object.defineProperty(this,"password",{configurable:!0,enumerable:!1,writable:!0,value:E("password",e)}),this.binary=E("binary",e),this.options=E("options",e),this.ssl=typeof e.ssl>"u"?co():e.ssl,typeof this.ssl=="string"&&this.ssl==="true"&&(this.ssl=!0),this.ssl==="no-verify"&&(this.ssl={rejectUnauthorized:!1}),this.ssl&&this.ssl.key&&Object.defineProperty(this.ssl,"key",{enumerable:!1}),this.client_encoding=E("client_encoding",e),this.replication=E("replication",e),this.isDomainSocket=!(this.host||"").indexOf("/"),this.application_name=E("application_name",e,"PGAPPNAME"),this.fallback_application_name=E("fallback_application_name",e,!1),this.statement_timeout=E("statement_timeout",e,!1),this.lock_timeout=E("lock_timeout",e,!1),this.idle_in_transaction_session_timeout=E("idle_in_transaction_session_timeout",e,!1),this.query_timeout=E("query_timeout",e,!1),e.connectionTimeoutMillis===void 0?this.connect_timeout=process.env.PGCONNECT_TIMEOUT||0:this.connect_timeout=Math.floor(e.connectionTimeoutMillis/1e3),e.keepAlive===!1?this.keepalives=0:e.keepAlive===!0&&(this.keepalives=1),typeof e.keepAliveInitialDelayMillis=="number"&&(this.keepalives_idle=Math.floor(e.keepAliveInitialDelayMillis/1e3))}getLibpqConnectionString(e){var r=[];I(r,this,"user"),I(r,this,"password"),I(r,this,"port"),I(r,this,"application_name"),I(r,this,"fallback_application_name"),I(r,this,"connect_timeout"),I(r,this,"options");var s=typeof this.ssl=="object"?this.ssl:this.ssl?{sslmode:this.ssl}:{};if(I(r,s,"sslmode"),I(r,s,"sslca"),I(r,s,"sslkey"),I(r,s,"sslcert"),I(r,s,"sslrootcert"),this.database&&r.push("dbname="+H(this.database)),this.replication&&r.push("replication="+H(this.replication)),this.host&&r.push("host="+H(this.host)),this.isDomainSocket)return e(null,r.join(" "));this.client_encoding&&r.push("client_encoding="+H(this.client_encoding)),ao.lookup(this.host,function(n,o){return n?e(n,null):(r.push("hostaddr="+H(o)),e(null,r.join(" ")))})}};Dr.exports=Je});var Lr=m((fa,qr)=>{"use strict";var lo=ee(),Nr=/^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/,Xe=class{constructor(e,r){this.command=null,this.rowCount=null,this.oid=null,this.rows=[],this.fields=[],this._parsers=void 0,this._types=r,this.RowCtor=null,this.rowAsArray=e==="array",this.rowAsArray&&(this.parseRow=this._parseRowAsArray),this._prebuiltEmptyResultObject=null}addCommandComplete(e){var r;e.text?r=Nr.exec(e.text):r=Nr.exec(e.command),r&&(this.command=r[1],r[3]?(this.oid=parseInt(r[2],10),this.rowCount=parseInt(r[3],10)):r[2]&&(this.rowCount=parseInt(r[2],10)))}_parseRowAsArray(e){for(var r=new Array(e.length),s=0,n=e.length;s<n;s++){var o=e[s];o!==null?r[s]=this._parsers[s](o):r[s]=null}return r}parseRow(e){for(var r={...this._prebuiltEmptyResultObject},s=0,n=e.length;s<n;s++){var o=e[s],i=this.fields[s].name;o!==null?r[i]=this._parsers[s](o):r[i]=null}return r}addRow(e){this.rows.push(e)}addFields(e){this.fields=e,this.fields.length&&(this._parsers=new Array(e.length));for(var r={},s=0;s<e.length;s++){var n=e[s];r[n.name]=null,this._types?this._parsers[s]=this._types.getTypeParser(n.dataTypeID,n.format||"text"):this._parsers[s]=lo.getTypeParser(n.dataTypeID,n.format||"text")}this._prebuiltEmptyResultObject={...r}}};qr.exports=Xe});var Qr=m((ma,Fr)=>{"use strict";var{EventEmitter:uo}=require("events"),Or=Lr(),Br=re(),et=class extends uo{constructor(e,r,s){super(),e=Br.normalizeQueryConfig(e,r,s),this.text=e.text,this.values=e.values,this.rows=e.rows,this.types=e.types,this.name=e.name,this.queryMode=e.queryMode,this.binary=e.binary,this.portal=e.portal||"",this.callback=e.callback,this._rowMode=e.rowMode,process.domain&&e.callback&&(this.callback=process.domain.bind(e.callback)),this._result=new Or(this._rowMode,this.types),this._results=this._result,this._canceledDueToError=!1}requiresPreparation(){return this.queryMode==="extended"||this.name||this.rows?!0:!this.text||!this.values?!1:this.values.length>0}_checkForMultirow(){this._result.command&&(Array.isArray(this._results)||(this._results=[this._result]),this._result=new Or(this._rowMode,this._result._types),this._results.push(this._result))}handleRowDescription(e){this._checkForMultirow(),this._result.addFields(e.fields),this._accumulateRows=this.callback||!this.listeners("row").length}handleDataRow(e){let r;if(!this._canceledDueToError){try{r=this._result.parseRow(e.fields)}catch(s){this._canceledDueToError=s;return}this.emit("row",r,this._result),this._accumulateRows&&this._result.addRow(r)}}handleCommandComplete(e,r){this._checkForMultirow(),this._result.addCommandComplete(e),this.rows&&r.sync()}handleEmptyQuery(e){this.rows&&e.sync()}handleError(e,r){if(this._canceledDueToError&&(e=this._canceledDueToError,this._canceledDueToError=!1),this.callback)return this.callback(e);this.emit("error",e)}handleReadyForQuery(e){if(this._canceledDueToError)return this.handleError(this._canceledDueToError,e);if(this.callback)try{this.callback(null,this._results)}catch(r){process.nextTick(()=>{throw r})}this.emit("end",this._results)}submit(e){if(typeof this.text!="string"&&typeof this.name!="string")return new Error("A query must have either text or a name. Supplying neither is unsupported.");let r=e.parsedStatements[this.name];if(this.text&&r&&this.text!==r)return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);if(this.values&&!Array.isArray(this.values))return new Error("Query values must be an array");if(this.requiresPreparation()){e.stream.cork&&e.stream.cork();try{this.prepare(e)}finally{e.stream.uncork&&e.stream.uncork()}}else e.query(this.text);return null}hasBeenParsed(e){return this.name&&e.parsedStatements[this.name]}handlePortalSuspended(e){this._getRows(e,this.rows)}_getRows(e,r){e.execute({portal:this.portal,rows:r}),r?e.flush():e.sync()}prepare(e){this.hasBeenParsed(e)||e.parse({text:this.text,name:this.name,types:this.types});try{e.bind({portal:this.portal,statement:this.name,values:this.values,binary:this.binary,valueMapper:Br.prepareValue})}catch(r){this.handleError(r,e);return}e.describe({type:"P",name:this.portal||""}),this._getRows(e,this.rows)}handleCopyInResponse(e){e.sendCopyFail("No source stream defined")}handleCopyData(e,r){}};Fr.exports=et});var mt=m(f=>{"use strict";Object.defineProperty(f,"__esModule",{value:!0});f.NoticeMessage=f.DataRowMessage=f.CommandCompleteMessage=f.ReadyForQueryMessage=f.NotificationResponseMessage=f.BackendKeyDataMessage=f.AuthenticationMD5Password=f.ParameterStatusMessage=f.ParameterDescriptionMessage=f.RowDescriptionMessage=f.Field=f.CopyResponse=f.CopyDataMessage=f.DatabaseError=f.copyDone=f.emptyQuery=f.replicationStart=f.portalSuspended=f.noData=f.closeComplete=f.bindComplete=f.parseComplete=void 0;f.parseComplete={name:"parseComplete",length:5};f.bindComplete={name:"bindComplete",length:5};f.closeComplete={name:"closeComplete",length:5};f.noData={name:"noData",length:5};f.portalSuspended={name:"portalSuspended",length:5};f.replicationStart={name:"replicationStart",length:4};f.emptyQuery={name:"emptyQuery",length:4};f.copyDone={name:"copyDone",length:4};var tt=class extends Error{constructor(e,r,s){super(e),this.length=r,this.name=s}};f.DatabaseError=tt;var rt=class{constructor(e,r){this.length=e,this.chunk=r,this.name="copyData"}};f.CopyDataMessage=rt;var st=class{constructor(e,r,s,n){this.length=e,this.name=r,this.binary=s,this.columnTypes=new Array(n)}};f.CopyResponse=st;var nt=class{constructor(e,r,s,n,o,i,a){this.name=e,this.tableID=r,this.columnID=s,this.dataTypeID=n,this.dataTypeSize=o,this.dataTypeModifier=i,this.format=a}};f.Field=nt;var ot=class{constructor(e,r){this.length=e,this.fieldCount=r,this.name="rowDescription",this.fields=new Array(this.fieldCount)}};f.RowDescriptionMessage=ot;var it=class{constructor(e,r){this.length=e,this.parameterCount=r,this.name="parameterDescription",this.dataTypeIDs=new Array(this.parameterCount)}};f.ParameterDescriptionMessage=it;var at=class{constructor(e,r,s){this.length=e,this.parameterName=r,this.parameterValue=s,this.name="parameterStatus"}};f.ParameterStatusMessage=at;var ct=class{constructor(e,r){this.length=e,this.salt=r,this.name="authenticationMD5Password"}};f.AuthenticationMD5Password=ct;var lt=class{constructor(e,r,s){this.length=e,this.processID=r,this.secretKey=s,this.name="backendKeyData"}};f.BackendKeyDataMessage=lt;var ut=class{constructor(e,r,s,n){this.length=e,this.processId=r,this.channel=s,this.payload=n,this.name="notification"}};f.NotificationResponseMessage=ut;var dt=class{constructor(e,r){this.length=e,this.status=r,this.name="readyForQuery"}};f.ReadyForQueryMessage=dt;var ht=class{constructor(e,r){this.length=e,this.text=r,this.name="commandComplete"}};f.CommandCompleteMessage=ht;var pt=class{constructor(e,r){this.length=e,this.fields=r,this.name="dataRow",this.fieldCount=r.length}};f.DataRowMessage=pt;var ft=class{constructor(e,r){this.length=e,this.message=r,this.name="notice"}};f.NoticeMessage=ft});var Ur=m(me=>{"use strict";Object.defineProperty(me,"__esModule",{value:!0});me.Writer=void 0;var vt=class{constructor(e=256){this.size=e,this.offset=5,this.headerPosition=0,this.buffer=Buffer.allocUnsafe(e)}ensure(e){var r=this.buffer.length-this.offset;if(r<e){var s=this.buffer,n=s.length+(s.length>>1)+e;this.buffer=Buffer.allocUnsafe(n),s.copy(this.buffer)}}addInt32(e){return this.ensure(4),this.buffer[this.offset++]=e>>>24&255,this.buffer[this.offset++]=e>>>16&255,this.buffer[this.offset++]=e>>>8&255,this.buffer[this.offset++]=e>>>0&255,this}addInt16(e){return this.ensure(2),this.buffer[this.offset++]=e>>>8&255,this.buffer[this.offset++]=e>>>0&255,this}addCString(e){if(!e)this.ensure(1);else{var r=Buffer.byteLength(e);this.ensure(r+1),this.buffer.write(e,this.offset,"utf-8"),this.offset+=r}return this.buffer[this.offset++]=0,this}addString(e=""){var r=Buffer.byteLength(e);return this.ensure(r),this.buffer.write(e,this.offset),this.offset+=r,this}add(e){return this.ensure(e.length),e.copy(this.buffer,this.offset),this.offset+=e.length,this}join(e){if(e){this.buffer[this.headerPosition]=e;let r=this.offset-(this.headerPosition+1);this.buffer.writeInt32BE(r,this.headerPosition+1)}return this.buffer.slice(e?0:5,this.offset)}flush(e){var r=this.join(e);return this.offset=5,this.headerPosition=0,this.buffer=Buffer.allocUnsafe(this.size),r}};me.Writer=vt});var $r=m(ye=>{"use strict";Object.defineProperty(ye,"__esModule",{value:!0});ye.serialize=void 0;var yt=Ur(),g=new yt.Writer,ho=t=>{g.addInt16(3).addInt16(0);for(let s of Object.keys(t))g.addCString(s).addCString(t[s]);g.addCString("client_encoding").addCString("UTF8");var e=g.addCString("").flush(),r=e.length+4;return new yt.Writer().addInt32(r).add(e).flush()},po=()=>{let t=Buffer.allocUnsafe(8);return t.writeInt32BE(8,0),t.writeInt32BE(80877103,4),t},fo=t=>g.addCString(t).flush(112),mo=function(t,e){return g.addCString(t).addInt32(Buffer.byteLength(e)).addString(e),g.flush(112)},vo=function(t){return g.addString(t).flush(112)},yo=t=>g.addCString(t).flush(81),Hr=[],go=t=>{let e=t.name||"";e.length>63&&(console.error("Warning! Postgres only supports 63 characters for query names."),console.error("You supplied %s (%s)",e,e.length),console.error("This can cause conflicts and silent errors executing queries"));let r=t.types||Hr;for(var s=r.length,n=g.addCString(e).addCString(t.text).addInt16(s),o=0;o<s;o++)n.addInt32(r[o]);return g.flush(80)},$=new yt.Writer,bo=function(t,e){for(let r=0;r<t.length;r++){let s=e?e(t[r],r):t[r];s==null?(g.addInt16(0),$.addInt32(-1)):s instanceof Buffer?(g.addInt16(1),$.addInt32(s.length),$.add(s)):(g.addInt16(0),$.addInt32(Buffer.byteLength(s)),$.addString(s))}},wo=(t={})=>{let e=t.portal||"",r=t.statement||"",s=t.binary||!1,n=t.values||Hr,o=n.length;return g.addCString(e).addCString(r),g.addInt16(o),bo(n,t.valueMapper),g.addInt16(o),g.add($.flush()),g.addInt16(s?1:0),g.flush(66)},_o=Buffer.from([69,0,0,0,9,0,0,0,0,0]),So=t=>{if(!t||!t.portal&&!t.rows)return _o;let e=t.portal||"",r=t.rows||0,s=Buffer.byteLength(e),n=4+s+1+4,o=Buffer.allocUnsafe(1+n);return o[0]=69,o.writeInt32BE(n,1),o.write(e,5,"utf-8"),o[s+5]=0,o.writeUInt32BE(r,o.length-4),o},Eo=(t,e)=>{let r=Buffer.allocUnsafe(16);return r.writeInt32BE(16,0),r.writeInt16BE(1234,4),r.writeInt16BE(5678,6),r.writeInt32BE(t,8),r.writeInt32BE(e,12),r},gt=(t,e)=>{let s=4+Buffer.byteLength(e)+1,n=Buffer.allocUnsafe(1+s);return n[0]=t,n.writeInt32BE(s,1),n.write(e,5,"utf-8"),n[s]=0,n},Co=g.addCString("P").flush(68),xo=g.addCString("S").flush(68),ko=t=>t.name?gt(68,`${t.type}${t.name||""}`):t.type==="P"?Co:xo,To=t=>{let e=`${t.type}${t.name||""}`;return gt(67,e)},Io=t=>g.add(t).flush(100),Ao=t=>gt(102,t),ve=t=>Buffer.from([t,0,0,0,4]),Po=ve(72),Mo=ve(83),Ro=ve(88),Do=ve(99),No={startup:ho,password:fo,requestSsl:po,sendSASLInitialResponseMessage:mo,sendSCRAMClientFinalMessage:vo,query:yo,parse:go,bind:wo,execute:So,describe:ko,close:To,flush:()=>Po,sync:()=>Mo,end:()=>Ro,copyData:Io,copyDone:()=>Do,copyFail:Ao,cancel:Eo};ye.serialize=No});var jr=m(ge=>{"use strict";Object.defineProperty(ge,"__esModule",{value:!0});ge.BufferReader=void 0;var qo=Buffer.allocUnsafe(0),bt=class{constructor(e=0){this.offset=e,this.buffer=qo,this.encoding="utf-8"}setBuffer(e,r){this.offset=e,this.buffer=r}int16(){let e=this.buffer.readInt16BE(this.offset);return this.offset+=2,e}byte(){let e=this.buffer[this.offset];return this.offset++,e}int32(){let e=this.buffer.readInt32BE(this.offset);return this.offset+=4,e}uint32(){let e=this.buffer.readUInt32BE(this.offset);return this.offset+=4,e}string(e){let r=this.buffer.toString(this.encoding,this.offset,this.offset+e);return this.offset+=e,r}cstring(){let e=this.offset,r=e;for(;this.buffer[r++]!==0;);return this.offset=r,this.buffer.toString(this.encoding,e,r-1)}bytes(e){let r=this.buffer.slice(this.offset,this.offset+e);return this.offset+=e,r}};ge.BufferReader=bt});var Gr=m(be=>{"use strict";Object.defineProperty(be,"__esModule",{value:!0});be.Parser=void 0;var b=mt(),Lo=jr(),wt=1,Oo=4,Vr=wt+Oo,Wr=Buffer.allocUnsafe(0),_t=class{constructor(e){if(this.buffer=Wr,this.bufferLength=0,this.bufferOffset=0,this.reader=new Lo.BufferReader,e?.mode==="binary")throw new Error("Binary mode not supported yet");this.mode=e?.mode||"text"}parse(e,r){this.mergeBuffer(e);let s=this.bufferOffset+this.bufferLength,n=this.bufferOffset;for(;n+Vr<=s;){let o=this.buffer[n],i=this.buffer.readUInt32BE(n+wt),a=wt+i;if(a+n<=s){let l=this.handlePacket(n+Vr,o,i,this.buffer);r(l),n+=a}else break}n===s?(this.buffer=Wr,this.bufferLength=0,this.bufferOffset=0):(this.bufferLength=s-n,this.bufferOffset=n)}mergeBuffer(e){if(this.bufferLength>0){let r=this.bufferLength+e.byteLength;if(r+this.bufferOffset>this.buffer.byteLength){let n;if(r<=this.buffer.byteLength&&this.bufferOffset>=this.bufferLength)n=this.buffer;else{let o=this.buffer.byteLength*2;for(;r>=o;)o*=2;n=Buffer.allocUnsafe(o)}this.buffer.copy(n,0,this.bufferOffset,this.bufferOffset+this.bufferLength),this.buffer=n,this.bufferOffset=0}e.copy(this.buffer,this.bufferOffset+this.bufferLength),this.bufferLength=r}else this.buffer=e,this.bufferOffset=0,this.bufferLength=e.byteLength}handlePacket(e,r,s,n){switch(r){case 50:return b.bindComplete;case 49:return b.parseComplete;case 51:return b.closeComplete;case 110:return b.noData;case 115:return b.portalSuspended;case 99:return b.copyDone;case 87:return b.replicationStart;case 73:return b.emptyQuery;case 68:return this.parseDataRowMessage(e,s,n);case 67:return this.parseCommandCompleteMessage(e,s,n);case 90:return this.parseReadyForQueryMessage(e,s,n);case 65:return this.parseNotificationMessage(e,s,n);case 82:return this.parseAuthenticationResponse(e,s,n);case 83:return this.parseParameterStatusMessage(e,s,n);case 75:return this.parseBackendKeyData(e,s,n);case 69:return this.parseErrorMessage(e,s,n,"error");case 78:return this.parseErrorMessage(e,s,n,"notice");case 84:return this.parseRowDescriptionMessage(e,s,n);case 116:return this.parseParameterDescriptionMessage(e,s,n);case 71:return this.parseCopyInMessage(e,s,n);case 72:return this.parseCopyOutMessage(e,s,n);case 100:return this.parseCopyData(e,s,n);default:return new b.DatabaseError("received invalid response: "+r.toString(16),s,"error")}}parseReadyForQueryMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.string(1);return new b.ReadyForQueryMessage(r,n)}parseCommandCompleteMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.cstring();return new b.CommandCompleteMessage(r,n)}parseCopyData(e,r,s){let n=s.slice(e,e+(r-4));return new b.CopyDataMessage(r,n)}parseCopyInMessage(e,r,s){return this.parseCopyMessage(e,r,s,"copyInResponse")}parseCopyOutMessage(e,r,s){return this.parseCopyMessage(e,r,s,"copyOutResponse")}parseCopyMessage(e,r,s,n){this.reader.setBuffer(e,s);let o=this.reader.byte()!==0,i=this.reader.int16(),a=new b.CopyResponse(r,n,o,i);for(let l=0;l<i;l++)a.columnTypes[l]=this.reader.int16();return a}parseNotificationMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int32(),o=this.reader.cstring(),i=this.reader.cstring();return new b.NotificationResponseMessage(r,n,o,i)}parseRowDescriptionMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int16(),o=new b.RowDescriptionMessage(r,n);for(let i=0;i<n;i++)o.fields[i]=this.parseField();return o}parseField(){let e=this.reader.cstring(),r=this.reader.uint32(),s=this.reader.int16(),n=this.reader.uint32(),o=this.reader.int16(),i=this.reader.int32(),a=this.reader.int16()===0?"text":"binary";return new b.Field(e,r,s,n,o,i,a)}parseParameterDescriptionMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int16(),o=new b.ParameterDescriptionMessage(r,n);for(let i=0;i<n;i++)o.dataTypeIDs[i]=this.reader.int32();return o}parseDataRowMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int16(),o=new Array(n);for(let i=0;i<n;i++){let a=this.reader.int32();o[i]=a===-1?null:this.reader.string(a)}return new b.DataRowMessage(r,o)}parseParameterStatusMessage(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.cstring(),o=this.reader.cstring();return new b.ParameterStatusMessage(r,n,o)}parseBackendKeyData(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int32(),o=this.reader.int32();return new b.BackendKeyDataMessage(r,n,o)}parseAuthenticationResponse(e,r,s){this.reader.setBuffer(e,s);let n=this.reader.int32(),o={name:"authenticationOk",length:r};switch(n){case 0:break;case 3:o.length===8&&(o.name="authenticationCleartextPassword");break;case 5:if(o.length===12){o.name="authenticationMD5Password";let a=this.reader.bytes(4);return new b.AuthenticationMD5Password(r,a)}break;case 10:o.name="authenticationSASL",o.mechanisms=[];let i;do i=this.reader.cstring(),i&&o.mechanisms.push(i);while(i);break;case 11:o.name="authenticationSASLContinue",o.data=this.reader.string(r-8);break;case 12:o.name="authenticationSASLFinal",o.data=this.reader.string(r-8);break;default:throw new Error("Unknown authenticationOk message type "+n)}return o}parseErrorMessage(e,r,s,n){this.reader.setBuffer(e,s);let o={},i=this.reader.string(1);for(;i!=="\0";)o[i]=this.reader.cstring(),i=this.reader.string(1);let a=o.M,l=n==="notice"?new b.NoticeMessage(r,a):new b.DatabaseError(a,r,n);return l.severity=o.S,l.code=o.C,l.detail=o.D,l.hint=o.H,l.position=o.P,l.internalPosition=o.p,l.internalQuery=o.q,l.where=o.W,l.schema=o.s,l.table=o.t,l.column=o.c,l.dataType=o.d,l.constraint=o.n,l.file=o.F,l.line=o.L,l.routine=o.R,l}};be.Parser=_t});var St=m(q=>{"use strict";Object.defineProperty(q,"__esModule",{value:!0});q.DatabaseError=q.serialize=q.parse=void 0;var Bo=mt();Object.defineProperty(q,"DatabaseError",{enumerable:!0,get:function(){return Bo.DatabaseError}});var Fo=$r();Object.defineProperty(q,"serialize",{enumerable:!0,get:function(){return Fo.serialize}});var Qo=Gr();function Uo(t,e){let r=new Qo.Parser;return t.on("data",s=>r.parse(s,e)),new Promise(s=>t.on("end",()=>s()))}q.parse=Uo});var Kr={};qt(Kr,{default:()=>Ho});var Ho,zr=qs(()=>{Ho={}});var Jr=m((Sa,Yr)=>{var{getStream:$o,getSecureStream:jo}=Ko();Yr.exports={getStream:$o,getSecureStream:jo};function Vo(){function t(r){let s=require("net");return new s.Socket}function e(r){var s=require("tls");return s.connect(r)}return{getStream:t,getSecureStream:e}}function Wo(){function t(r){let{CloudflareSocket:s}=(zr(),Ot(Kr));return new s(r)}function e(r){return r.socket.startTls(r),r.socket}return{getStream:t,getSecureStream:e}}function Go(){if(typeof navigator=="object"&&navigator!==null&&typeof navigator.userAgent=="string")return navigator.userAgent==="Cloudflare-Workers";if(typeof Response=="function"){let t=new Response(null,{cf:{thing:!0}});if(typeof t.cf=="object"&&t.cf!==null&&t.cf.thing)return!0}return!1}function Ko(){return Go()?Wo():Vo()}});var Ct=m((Ea,Zr)=>{"use strict";var zo=require("events").EventEmitter,{parse:Yo,serialize:_}=St(),{getStream:Jo,getSecureStream:Zo}=Jr(),Xo=_.flush(),ei=_.sync(),ti=_.end(),Et=class extends zo{constructor(e){super(),e=e||{},this.stream=e.stream||Jo(e.ssl),typeof this.stream=="function"&&(this.stream=this.stream(e)),this._keepAlive=e.keepAlive,this._keepAliveInitialDelayMillis=e.keepAliveInitialDelayMillis,this.lastBuffer=!1,this.parsedStatements={},this.ssl=e.ssl||!1,this._ending=!1,this._emitMessage=!1;var r=this;this.on("newListener",function(s){s==="message"&&(r._emitMessage=!0)})}connect(e,r){var s=this;this._connecting=!0,this.stream.setNoDelay(!0),this.stream.connect(e,r),this.stream.once("connect",function(){s._keepAlive&&s.stream.setKeepAlive(!0,s._keepAliveInitialDelayMillis),s.emit("connect")});let n=function(o){s._ending&&(o.code==="ECONNRESET"||o.code==="EPIPE")||s.emit("error",o)};if(this.stream.on("error",n),this.stream.on("close",function(){s.emit("end")}),!this.ssl)return this.attachListeners(this.stream);this.stream.once("data",function(o){var i=o.toString("utf8");switch(i){case"S":break;case"N":return s.stream.end(),s.emit("error",new Error("The server does not support SSL connections"));default:return s.stream.end(),s.emit("error",new Error("There was an error establishing an SSL connection"))}let a={socket:s.stream};s.ssl!==!0&&(Object.assign(a,s.ssl),"key"in s.ssl&&(a.key=s.ssl.key));var l=require("net");l.isIP&&l.isIP(r)===0&&(a.servername=r);try{s.stream=Zo(a)}catch(c){return s.emit("error",c)}s.attachListeners(s.stream),s.stream.on("error",n),s.emit("sslconnect")})}attachListeners(e){Yo(e,r=>{var s=r.name==="error"?"errorMessage":r.name;this._emitMessage&&this.emit("message",r),this.emit(s,r)})}requestSsl(){this.stream.write(_.requestSsl())}startup(e){this.stream.write(_.startup(e))}cancel(e,r){this._send(_.cancel(e,r))}password(e){this._send(_.password(e))}sendSASLInitialResponseMessage(e,r){this._send(_.sendSASLInitialResponseMessage(e,r))}sendSCRAMClientFinalMessage(e){this._send(_.sendSCRAMClientFinalMessage(e))}_send(e){return this.stream.writable?this.stream.write(e):!1}query(e){this._send(_.query(e))}parse(e){this._send(_.parse(e))}bind(e){this._send(_.bind(e))}execute(e){this._send(_.execute(e))}flush(){this.stream.writable&&this.stream.write(Xo)}sync(){this._ending=!0,this._send(ei)}ref(){this.stream.ref()}unref(){this.stream.unref()}end(){if(this._ending=!0,!this._connecting||!this.stream.writable){this.stream.end();return}return this.stream.write(ti,()=>{this.stream.end()})}close(e){this._send(_.close(e))}describe(e){this._send(_.describe(e))}sendCopyFromChunk(e){this._send(_.copyData(e))}endCopyFrom(){this._send(_.copyDone())}sendCopyFail(e){this._send(_.copyFail(e))}};Zr.exports=Et});var rs=m((Ca,ts)=>{"use strict";var{Transform:ri}=require("stream"),{StringDecoder:si}=require("string_decoder"),L=Symbol("last"),we=Symbol("decoder");function ni(t,e,r){let s;if(this.overflow){if(s=this[we].write(t).split(this.matcher),s.length===1)return r();s.shift(),this.overflow=!1}else this[L]+=this[we].write(t),s=this[L].split(this.matcher);this[L]=s.pop();for(let n=0;n<s.length;n++)try{es(this,this.mapper(s[n]))}catch(o){return r(o)}if(this.overflow=this[L].length>this.maxLength,this.overflow&&!this.skipOverflow){r(new Error("maximum buffer reached"));return}r()}function oi(t){if(this[L]+=this[we].end(),this[L])try{es(this,this.mapper(this[L]))}catch(e){return t(e)}t()}function es(t,e){e!==void 0&&t.push(e)}function Xr(t){return t}function ii(t,e,r){switch(t=t||/\r?\n/,e=e||Xr,r=r||{},arguments.length){case 1:typeof t=="function"?(e=t,t=/\r?\n/):typeof t=="object"&&!(t instanceof RegExp)&&!t[Symbol.split]&&(r=t,t=/\r?\n/);break;case 2:typeof t=="function"?(r=e,e=t,t=/\r?\n/):typeof e=="object"&&(r=e,e=Xr)}r=Object.assign({},r),r.autoDestroy=!0,r.transform=ni,r.flush=oi,r.readableObjectMode=!0;let s=new ri(r);return s[L]="",s[we]=new si("utf8"),s.matcher=t,s.mapper=e,s.maxLength=r.maxLength,s.skipOverflow=r.skipOverflow||!1,s.overflow=!1,s._destroy=function(n,o){this._writableState.errorEmitted=!1,o(n)},s}ts.exports=ii});var os=m((xa,R)=>{"use strict";var ss=require("path"),ai=require("stream").Stream,ci=rs(),ns=require("util"),li=5432,_e=process.platform==="win32",ne=process.stderr,ui=56,di=7,hi=61440,pi=32768;function fi(t){return(t&hi)==pi}var j=["host","port","database","user","password"],xt=j.length,mi=j[xt-1];function kt(){var t=ne instanceof ai&&ne.writable===!0;if(t){var e=Array.prototype.slice.call(arguments).concat(`
`);ne.write(ns.format.apply(ns,e))}}Object.defineProperty(R.exports,"isWin",{get:function(){return _e},set:function(t){_e=t}});R.exports.warnTo=function(t){var e=ne;return ne=t,e};R.exports.getFileName=function(t){var e=t||process.env,r=e.PGPASSFILE||(_e?ss.join(e.APPDATA||"./","postgresql","pgpass.conf"):ss.join(e.HOME||"./",".pgpass"));return r};R.exports.usePgPass=function(t,e){return Object.prototype.hasOwnProperty.call(process.env,"PGPASSWORD")?!1:_e?!0:(e=e||"<unkn>",fi(t.mode)?t.mode&(ui|di)?(kt('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less',e),!1):!0:(kt('WARNING: password file "%s" is not a plain file',e),!1))};var vi=R.exports.match=function(t,e){return j.slice(0,-1).reduce(function(r,s,n){return n==1&&Number(t[s]||li)===Number(e[s])?r&&!0:r&&(e[s]==="*"||e[s]===t[s])},!0)};R.exports.getPassword=function(t,e,r){var s,n=e.pipe(ci());function o(l){var c=yi(l);c&&gi(c)&&vi(t,c)&&(s=c[mi],n.end())}var i=function(){e.destroy(),r(s)},a=function(l){e.destroy(),kt("WARNING: error on reading file: %s",l),r(void 0)};e.on("error",a),n.on("data",o).on("end",i).on("error",a)};var yi=R.exports.parseLine=function(t){if(t.length<11||t.match(/^\s+#/))return null;for(var e="",r="",s=0,n=0,o=0,i={},a=!1,l=function(d,h,p){var w=t.substring(h,p);Object.hasOwnProperty.call(process.env,"PGPASS_NO_DEESCAPE")||(w=w.replace(/\\([:\\])/g,"$1")),i[j[d]]=w},c=0;c<t.length-1;c+=1){if(e=t.charAt(c+1),r=t.charAt(c),a=s==xt-1,a){l(s,n);break}c>=0&&e==":"&&r!=="\\"&&(l(s,n,c+1),n=c+2,s+=1)}return i=Object.keys(i).length===xt?i:null,i},gi=R.exports.isValidEntry=function(t){for(var e={0:function(i){return i.length>0},1:function(i){return i==="*"?!0:(i=Number(i),isFinite(i)&&i>0&&i<9007199254740992&&Math.floor(i)===i)},2:function(i){return i.length>0},3:function(i){return i.length>0},4:function(i){return i.length>0}},r=0;r<j.length;r+=1){var s=e[r],n=t[j[r]]||"",o=s(n);if(!o)return!1}return!0}});var as=m((Ta,Tt)=>{"use strict";var ka=require("path"),is=require("fs"),Se=os();Tt.exports=function(t,e){var r=Se.getFileName();is.stat(r,function(s,n){if(s||!Se.usePgPass(n,r))return e(void 0);var o=is.createReadStream(r);Se.getPassword(t,o,e)})};Tt.exports.warnTo=Se.warnTo});var ds=m((Ia,us)=>{"use strict";var bi=require("events").EventEmitter,cs=re(),It=Tr(),wi=ze(),_i=Ze(),ls=Qr(),Si=te(),Ei=Ct(),Ci=Ge(),Ee=class extends bi{constructor(e){super(),this.connectionParameters=new _i(e),this.user=this.connectionParameters.user,this.database=this.connectionParameters.database,this.port=this.connectionParameters.port,this.host=this.connectionParameters.host,Object.defineProperty(this,"password",{configurable:!0,enumerable:!1,writable:!0,value:this.connectionParameters.password}),this.replication=this.connectionParameters.replication;var r=e||{};this._Promise=r.Promise||global.Promise,this._types=new wi(r.types),this._ending=!1,this._ended=!1,this._connecting=!1,this._connected=!1,this._connectionError=!1,this._queryable=!0,this.enableChannelBinding=!!r.enableChannelBinding,this.connection=r.connection||new Ei({stream:r.stream,ssl:this.connectionParameters.ssl,keepAlive:r.keepAlive||!1,keepAliveInitialDelayMillis:r.keepAliveInitialDelayMillis||0,encoding:this.connectionParameters.client_encoding||"utf8"}),this.queryQueue=[],this.binary=r.binary||Si.binary,this.processID=null,this.secretKey=null,this.ssl=this.connectionParameters.ssl||!1,this.ssl&&this.ssl.key&&Object.defineProperty(this.ssl,"key",{enumerable:!1}),this._connectionTimeoutMillis=r.connectionTimeoutMillis||0}_errorAllQueries(e){let r=s=>{process.nextTick(()=>{s.handleError(e,this.connection)})};this.activeQuery&&(r(this.activeQuery),this.activeQuery=null),this.queryQueue.forEach(r),this.queryQueue.length=0}_connect(e){var r=this,s=this.connection;if(this._connectionCallback=e,this._connecting||this._connected){let n=new Error("Client has already been connected. You cannot reuse a client.");process.nextTick(()=>{e(n)});return}this._connecting=!0,this._connectionTimeoutMillis>0&&(this.connectionTimeoutHandle=setTimeout(()=>{s._ending=!0,s.stream.destroy(new Error("timeout expired"))},this._connectionTimeoutMillis),this.connectionTimeoutHandle.unref&&this.connectionTimeoutHandle.unref()),this.host&&this.host.indexOf("/")===0?s.connect(this.host+"/.s.PGSQL."+this.port):s.connect(this.port,this.host),s.on("connect",function(){r.ssl?s.requestSsl():s.startup(r.getStartupConf())}),s.on("sslconnect",function(){s.startup(r.getStartupConf())}),this._attachListeners(s),s.once("end",()=>{let n=this._ending?new Error("Connection terminated"):new Error("Connection terminated unexpectedly");clearTimeout(this.connectionTimeoutHandle),this._errorAllQueries(n),this._ended=!0,this._ending||(this._connecting&&!this._connectionError?this._connectionCallback?this._connectionCallback(n):this._handleErrorEvent(n):this._connectionError||this._handleErrorEvent(n)),process.nextTick(()=>{this.emit("end")})})}connect(e){if(e){this._connect(e);return}return new this._Promise((r,s)=>{this._connect(n=>{n?s(n):r()})})}_attachListeners(e){e.on("authenticationCleartextPassword",this._handleAuthCleartextPassword.bind(this)),e.on("authenticationMD5Password",this._handleAuthMD5Password.bind(this)),e.on("authenticationSASL",this._handleAuthSASL.bind(this)),e.on("authenticationSASLContinue",this._handleAuthSASLContinue.bind(this)),e.on("authenticationSASLFinal",this._handleAuthSASLFinal.bind(this)),e.on("backendKeyData",this._handleBackendKeyData.bind(this)),e.on("error",this._handleErrorEvent.bind(this)),e.on("errorMessage",this._handleErrorMessage.bind(this)),e.on("readyForQuery",this._handleReadyForQuery.bind(this)),e.on("notice",this._handleNotice.bind(this)),e.on("rowDescription",this._handleRowDescription.bind(this)),e.on("dataRow",this._handleDataRow.bind(this)),e.on("portalSuspended",this._handlePortalSuspended.bind(this)),e.on("emptyQuery",this._handleEmptyQuery.bind(this)),e.on("commandComplete",this._handleCommandComplete.bind(this)),e.on("parseComplete",this._handleParseComplete.bind(this)),e.on("copyInResponse",this._handleCopyInResponse.bind(this)),e.on("copyData",this._handleCopyData.bind(this)),e.on("notification",this._handleNotification.bind(this))}_checkPgPass(e){let r=this.connection;if(typeof this.password=="function")this._Promise.resolve().then(()=>this.password()).then(s=>{if(s!==void 0){if(typeof s!="string"){r.emit("error",new TypeError("Password must be a string"));return}this.connectionParameters.password=this.password=s}else this.connectionParameters.password=this.password=null;e()}).catch(s=>{r.emit("error",s)});else if(this.password!==null)e();else try{as()(this.connectionParameters,n=>{n!==void 0&&(this.connectionParameters.password=this.password=n),e()})}catch(s){this.emit("error",s)}}_handleAuthCleartextPassword(e){this._checkPgPass(()=>{this.connection.password(this.password)})}_handleAuthMD5Password(e){this._checkPgPass(async()=>{try{let r=await Ci.postgresMd5PasswordHash(this.user,this.password,e.salt);this.connection.password(r)}catch(r){this.emit("error",r)}})}_handleAuthSASL(e){this._checkPgPass(()=>{try{this.saslSession=It.startSession(e.mechanisms,this.enableChannelBinding&&this.connection.stream),this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism,this.saslSession.response)}catch(r){this.connection.emit("error",r)}})}async _handleAuthSASLContinue(e){try{await It.continueSession(this.saslSession,this.password,e.data,this.enableChannelBinding&&this.connection.stream),this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)}catch(r){this.connection.emit("error",r)}}_handleAuthSASLFinal(e){try{It.finalizeSession(this.saslSession,e.data),this.saslSession=null}catch(r){this.connection.emit("error",r)}}_handleBackendKeyData(e){this.processID=e.processID,this.secretKey=e.secretKey}_handleReadyForQuery(e){this._connecting&&(this._connecting=!1,this._connected=!0,clearTimeout(this.connectionTimeoutHandle),this._connectionCallback&&(this._connectionCallback(null,this),this._connectionCallback=null),this.emit("connect"));let{activeQuery:r}=this;this.activeQuery=null,this.readyForQuery=!0,r&&r.handleReadyForQuery(this.connection),this._pulseQueryQueue()}_handleErrorWhileConnecting(e){if(!this._connectionError){if(this._connectionError=!0,clearTimeout(this.connectionTimeoutHandle),this._connectionCallback)return this._connectionCallback(e);this.emit("error",e)}}_handleErrorEvent(e){if(this._connecting)return this._handleErrorWhileConnecting(e);this._queryable=!1,this._errorAllQueries(e),this.emit("error",e)}_handleErrorMessage(e){if(this._connecting)return this._handleErrorWhileConnecting(e);let r=this.activeQuery;if(!r){this._handleErrorEvent(e);return}this.activeQuery=null,r.handleError(e,this.connection)}_handleRowDescription(e){this.activeQuery.handleRowDescription(e)}_handleDataRow(e){this.activeQuery.handleDataRow(e)}_handlePortalSuspended(e){this.activeQuery.handlePortalSuspended(this.connection)}_handleEmptyQuery(e){this.activeQuery.handleEmptyQuery(this.connection)}_handleCommandComplete(e){if(this.activeQuery==null){let r=new Error("Received unexpected commandComplete message from backend.");this._handleErrorEvent(r);return}this.activeQuery.handleCommandComplete(e,this.connection)}_handleParseComplete(){if(this.activeQuery==null){let e=new Error("Received unexpected parseComplete message from backend.");this._handleErrorEvent(e);return}this.activeQuery.name&&(this.connection.parsedStatements[this.activeQuery.name]=this.activeQuery.text)}_handleCopyInResponse(e){this.activeQuery.handleCopyInResponse(this.connection)}_handleCopyData(e){this.activeQuery.handleCopyData(e,this.connection)}_handleNotification(e){this.emit("notification",e)}_handleNotice(e){this.emit("notice",e)}getStartupConf(){var e=this.connectionParameters,r={user:e.user,database:e.database},s=e.application_name||e.fallback_application_name;return s&&(r.application_name=s),e.replication&&(r.replication=""+e.replication),e.statement_timeout&&(r.statement_timeout=String(parseInt(e.statement_timeout,10))),e.lock_timeout&&(r.lock_timeout=String(parseInt(e.lock_timeout,10))),e.idle_in_transaction_session_timeout&&(r.idle_in_transaction_session_timeout=String(parseInt(e.idle_in_transaction_session_timeout,10))),e.options&&(r.options=e.options),r}cancel(e,r){if(e.activeQuery===r){var s=this.connection;this.host&&this.host.indexOf("/")===0?s.connect(this.host+"/.s.PGSQL."+this.port):s.connect(this.port,this.host),s.on("connect",function(){s.cancel(e.processID,e.secretKey)})}else e.queryQueue.indexOf(r)!==-1&&e.queryQueue.splice(e.queryQueue.indexOf(r),1)}setTypeParser(e,r,s){return this._types.setTypeParser(e,r,s)}getTypeParser(e,r){return this._types.getTypeParser(e,r)}escapeIdentifier(e){return cs.escapeIdentifier(e)}escapeLiteral(e){return cs.escapeLiteral(e)}_pulseQueryQueue(){if(this.readyForQuery===!0)if(this.activeQuery=this.queryQueue.shift(),this.activeQuery){this.readyForQuery=!1,this.hasExecuted=!0;let e=this.activeQuery.submit(this.connection);e&&process.nextTick(()=>{this.activeQuery.handleError(e,this.connection),this.readyForQuery=!0,this._pulseQueryQueue()})}else this.hasExecuted&&(this.activeQuery=null,this.emit("drain"))}query(e,r,s){var n,o,i,a,l;if(e==null)throw new TypeError("Client was passed a null or undefined query");return typeof e.submit=="function"?(i=e.query_timeout||this.connectionParameters.query_timeout,o=n=e,typeof r=="function"&&(n.callback=n.callback||r)):(i=e.query_timeout||this.connectionParameters.query_timeout,n=new ls(e,r,s),n.callback||(o=new this._Promise((c,d)=>{n.callback=(h,p)=>h?d(h):c(p)}).catch(c=>{throw Error.captureStackTrace(c),c}))),i&&(l=n.callback,a=setTimeout(()=>{var c=new Error("Query read timeout");process.nextTick(()=>{n.handleError(c,this.connection)}),l(c),n.callback=()=>{};var d=this.queryQueue.indexOf(n);d>-1&&this.queryQueue.splice(d,1),this._pulseQueryQueue()},i),n.callback=(c,d)=>{clearTimeout(a),l(c,d)}),this.binary&&!n.binary&&(n.binary=!0),n._result&&!n._result._types&&(n._result._types=this._types),this._queryable?this._ending?(process.nextTick(()=>{n.handleError(new Error("Client was closed and is not queryable"),this.connection)}),o):(this.queryQueue.push(n),this._pulseQueryQueue(),o):(process.nextTick(()=>{n.handleError(new Error("Client has encountered a connection error and is not queryable"),this.connection)}),o)}ref(){this.connection.ref()}unref(){this.connection.unref()}end(e){if(this._ending=!0,!this.connection._connecting||this._ended)if(e)e();else return this._Promise.resolve();if(this.activeQuery||!this._queryable?this.connection.stream.destroy():this.connection.end(),e)this.connection.once("end",e);else return new this._Promise(r=>{this.connection.once("end",r)})}};Ee.Query=ls;us.exports=Ee});var ms=m((Aa,fs)=>{"use strict";var xi=require("events").EventEmitter,hs=function(){},ps=(t,e)=>{let r=t.findIndex(e);return r===-1?void 0:t.splice(r,1)[0]},At=class{constructor(e,r,s){this.client=e,this.idleListener=r,this.timeoutId=s}},V=class{constructor(e){this.callback=e}};function ki(){throw new Error("Release called on client which has already been released to the pool.")}function Ce(t,e){if(e)return{callback:e,result:void 0};let r,s,n=function(i,a){i?r(i):s(a)},o=new t(function(i,a){s=i,r=a}).catch(i=>{throw Error.captureStackTrace(i),i});return{callback:n,result:o}}function Ti(t,e){return function r(s){s.client=e,e.removeListener("error",r),e.on("error",()=>{t.log("additional client error after disconnection due to error",s)}),t._remove(e),t.emit("error",s,e)}}var Pt=class extends xi{constructor(e,r){super(),this.options=Object.assign({},e),e!=null&&"password"in e&&Object.defineProperty(this.options,"password",{configurable:!0,enumerable:!1,writable:!0,value:e.password}),e!=null&&e.ssl&&e.ssl.key&&Object.defineProperty(this.options.ssl,"key",{enumerable:!1}),this.options.max=this.options.max||this.options.poolSize||10,this.options.maxUses=this.options.maxUses||1/0,this.options.allowExitOnIdle=this.options.allowExitOnIdle||!1,this.options.maxLifetimeSeconds=this.options.maxLifetimeSeconds||0,this.log=this.options.log||function(){},this.Client=this.options.Client||r||W().Client,this.Promise=this.options.Promise||global.Promise,typeof this.options.idleTimeoutMillis>"u"&&(this.options.idleTimeoutMillis=1e4),this._clients=[],this._idle=[],this._expired=new WeakSet,this._pendingQueue=[],this._endCallback=void 0,this.ending=!1,this.ended=!1}_isFull(){return this._clients.length>=this.options.max}_pulseQueue(){if(this.log("pulse queue"),this.ended){this.log("pulse queue ended");return}if(this.ending){this.log("pulse queue on ending"),this._idle.length&&this._idle.slice().map(r=>{this._remove(r.client)}),this._clients.length||(this.ended=!0,this._endCallback());return}if(!this._pendingQueue.length){this.log("no queued requests");return}if(!this._idle.length&&this._isFull())return;let e=this._pendingQueue.shift();if(this._idle.length){let r=this._idle.pop();clearTimeout(r.timeoutId);let s=r.client;s.ref&&s.ref();let n=r.idleListener;return this._acquireClient(s,e,n,!1)}if(!this._isFull())return this.newClient(e);throw new Error("unexpected condition")}_remove(e){let r=ps(this._idle,s=>s.client===e);r!==void 0&&clearTimeout(r.timeoutId),this._clients=this._clients.filter(s=>s!==e),e.end(),this.emit("remove",e)}connect(e){if(this.ending){let n=new Error("Cannot use a pool after calling end on the pool");return e?e(n):this.Promise.reject(n)}let r=Ce(this.Promise,e),s=r.result;if(this._isFull()||this._idle.length){if(this._idle.length&&process.nextTick(()=>this._pulseQueue()),!this.options.connectionTimeoutMillis)return this._pendingQueue.push(new V(r.callback)),s;let n=(a,l,c)=>{clearTimeout(i),r.callback(a,l,c)},o=new V(n),i=setTimeout(()=>{ps(this._pendingQueue,a=>a.callback===n),o.timedOut=!0,r.callback(new Error("timeout exceeded when trying to connect"))},this.options.connectionTimeoutMillis);return i.unref&&i.unref(),this._pendingQueue.push(o),s}return this.newClient(new V(r.callback)),s}newClient(e){let r=new this.Client(this.options);this._clients.push(r);let s=Ti(this,r);this.log("checking client timeout");let n,o=!1;this.options.connectionTimeoutMillis&&(n=setTimeout(()=>{this.log("ending client due to timeout"),o=!0,r.connection?r.connection.stream.destroy():r.end()},this.options.connectionTimeoutMillis)),this.log("connecting new client"),r.connect(i=>{if(n&&clearTimeout(n),r.on("error",s),i)this.log("client failed to connect",i),this._clients=this._clients.filter(a=>a!==r),o&&(i=new Error("Connection terminated due to connection timeout",{cause:i})),this._pulseQueue(),e.timedOut||e.callback(i,void 0,hs);else{if(this.log("new client connected"),this.options.maxLifetimeSeconds!==0){let a=setTimeout(()=>{this.log("ending client due to expired lifetime"),this._expired.add(r),this._idle.findIndex(c=>c.client===r)!==-1&&this._acquireClient(r,new V((c,d,h)=>h()),s,!1)},this.options.maxLifetimeSeconds*1e3);a.unref(),r.once("end",()=>clearTimeout(a))}return this._acquireClient(r,e,s,!0)}})}_acquireClient(e,r,s,n){n&&this.emit("connect",e),this.emit("acquire",e),e.release=this._releaseOnce(e,s),e.removeListener("error",s),r.timedOut?n&&this.options.verify?this.options.verify(e,e.release):e.release():n&&this.options.verify?this.options.verify(e,o=>{if(o)return e.release(o),r.callback(o,void 0,hs);r.callback(void 0,e,e.release)}):r.callback(void 0,e,e.release)}_releaseOnce(e,r){let s=!1;return n=>{s&&ki(),s=!0,this._release(e,r,n)}}_release(e,r,s){if(e.on("error",r),e._poolUseCount=(e._poolUseCount||0)+1,this.emit("release",s,e),s||this.ending||!e._queryable||e._ending||e._poolUseCount>=this.options.maxUses){e._poolUseCount>=this.options.maxUses&&this.log("remove expended client"),this._remove(e),this._pulseQueue();return}if(this._expired.has(e)){this.log("remove expired client"),this._expired.delete(e),this._remove(e),this._pulseQueue();return}let o;this.options.idleTimeoutMillis&&(o=setTimeout(()=>{this.log("remove idle client"),this._remove(e)},this.options.idleTimeoutMillis),this.options.allowExitOnIdle&&o.unref()),this.options.allowExitOnIdle&&e.unref(),this._idle.push(new At(e,r,o)),this._pulseQueue()}query(e,r,s){if(typeof e=="function"){let o=Ce(this.Promise,e);return setImmediate(function(){return o.callback(new Error("Passing a function as the first parameter to pool.query is not supported"))}),o.result}typeof r=="function"&&(s=r,r=void 0);let n=Ce(this.Promise,s);return s=n.callback,this.connect((o,i)=>{if(o)return s(o);let a=!1,l=c=>{a||(a=!0,i.release(c),s(c))};i.once("error",l),this.log("dispatching query");try{i.query(e,r,(c,d)=>{if(this.log("query dispatched"),i.removeListener("error",l),!a)return a=!0,i.release(c),c?s(c):s(void 0,d)})}catch(c){return i.release(c),s(c)}}),n.result}end(e){if(this.log("ending"),this.ending){let s=new Error("Called end on pool more than once");return e?e(s):this.Promise.reject(s)}this.ending=!0;let r=Ce(this.Promise,e);return this._endCallback=r.callback,this._pulseQueue(),r.result}get waitingCount(){return this._pendingQueue.length}get idleCount(){return this._idle.length}get expiredCount(){return this._clients.reduce((e,r)=>e+(this._expired.has(r)?1:0),0)}get totalCount(){return this._clients.length}};fs.exports=Pt});var gs=m((Pa,ys)=>{"use strict";var vs=require("events").EventEmitter,Ii=require("util"),Mt=re(),G=ys.exports=function(t,e,r){vs.call(this),t=Mt.normalizeQueryConfig(t,e,r),this.text=t.text,this.values=t.values,this.name=t.name,this.queryMode=t.queryMode,this.callback=t.callback,this.state="new",this._arrayMode=t.rowMode==="array",this._emitRowEvents=!1,this.on("newListener",function(s){s==="row"&&(this._emitRowEvents=!0)}.bind(this))};Ii.inherits(G,vs);var Ai={sqlState:"code",statementPosition:"position",messagePrimary:"message",context:"where",schemaName:"schema",tableName:"table",columnName:"column",dataTypeName:"dataType",constraintName:"constraint",sourceFile:"file",sourceLine:"line",sourceFunction:"routine"};G.prototype.handleError=function(t){var e=this.native.pq.resultErrorFields();if(e)for(var r in e){var s=Ai[r]||r;t[s]=e[r]}this.callback?this.callback(t):this.emit("error",t),this.state="error"};G.prototype.then=function(t,e){return this._getPromise().then(t,e)};G.prototype.catch=function(t){return this._getPromise().catch(t)};G.prototype._getPromise=function(){return this._promise?this._promise:(this._promise=new Promise(function(t,e){this._once("end",t),this._once("error",e)}.bind(this)),this._promise)};G.prototype.submit=function(t){this.state="running";var e=this;this.native=t.native,t.native.arrayMode=this._arrayMode;var r=function(o,i,a){if(t.native.arrayMode=!1,setImmediate(function(){e.emit("_done")}),o)return e.handleError(o);e._emitRowEvents&&(a.length>1?i.forEach((l,c)=>{l.forEach(d=>{e.emit("row",d,a[c])})}):i.forEach(function(l){e.emit("row",l,a)})),e.state="end",e.emit("end",a),e.callback&&e.callback(null,a)};if(process.domain&&(r=process.domain.bind(r)),this.name){this.name.length>63&&(console.error("Warning! Postgres only supports 63 characters for query names."),console.error("You supplied %s (%s)",this.name,this.name.length),console.error("This can cause conflicts and silent errors executing queries"));var s=(this.values||[]).map(Mt.prepareValue);if(t.namedQueries[this.name]){if(this.text&&t.namedQueries[this.name]!==this.text){let o=new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);return r(o)}return t.native.execute(this.name,s,r)}return t.native.prepare(this.name,this.text,s.length,function(o){return o?r(o):(t.namedQueries[e.name]=e.text,e.native.execute(e.name,s,r))})}else if(this.values){if(!Array.isArray(this.values)){let o=new Error("Query values must be an array");return r(o)}var n=this.values.map(Mt.prepareValue);t.native.query(this.text,n,r)}else this.queryMode==="extended"?t.native.query(this.text,[],r):t.native.query(this.text,r)}});var Es=m((Ma,Ss)=>{"use strict";var bs;try{bs=require("pg-native")}catch(t){throw t}var Pi=ze(),ws=require("events").EventEmitter,Mi=require("util"),Ri=Ze(),_s=gs(),x=Ss.exports=function(t){ws.call(this),t=t||{},this._Promise=t.Promise||global.Promise,this._types=new Pi(t.types),this.native=new bs({types:this._types}),this._queryQueue=[],this._ending=!1,this._connecting=!1,this._connected=!1,this._queryable=!0;var e=this.connectionParameters=new Ri(t);t.nativeConnectionString&&(e.nativeConnectionString=t.nativeConnectionString),this.user=e.user,Object.defineProperty(this,"password",{configurable:!0,enumerable:!1,writable:!0,value:e.password}),this.database=e.database,this.host=e.host,this.port=e.port,this.namedQueries={}};x.Query=_s;Mi.inherits(x,ws);x.prototype._errorAllQueries=function(t){let e=r=>{process.nextTick(()=>{r.native=this.native,r.handleError(t)})};this._hasActiveQuery()&&(e(this._activeQuery),this._activeQuery=null),this._queryQueue.forEach(e),this._queryQueue.length=0};x.prototype._connect=function(t){var e=this;if(this._connecting){process.nextTick(()=>t(new Error("Client has already been connected. You cannot reuse a client.")));return}this._connecting=!0,this.connectionParameters.getLibpqConnectionString(function(r,s){if(e.connectionParameters.nativeConnectionString&&(s=e.connectionParameters.nativeConnectionString),r)return t(r);e.native.connect(s,function(n){if(n)return e.native.end(),t(n);e._connected=!0,e.native.on("error",function(o){e._queryable=!1,e._errorAllQueries(o),e.emit("error",o)}),e.native.on("notification",function(o){e.emit("notification",{channel:o.relname,payload:o.extra})}),e.emit("connect"),e._pulseQueryQueue(!0),t()})})};x.prototype.connect=function(t){if(t){this._connect(t);return}return new this._Promise((e,r)=>{this._connect(s=>{s?r(s):e()})})};x.prototype.query=function(t,e,r){var s,n,o,i,a;if(t==null)throw new TypeError("Client was passed a null or undefined query");if(typeof t.submit=="function")o=t.query_timeout||this.connectionParameters.query_timeout,n=s=t,typeof e=="function"&&(t.callback=e);else if(o=t.query_timeout||this.connectionParameters.query_timeout,s=new _s(t,e,r),!s.callback){let l,c;n=new this._Promise((d,h)=>{l=d,c=h}).catch(d=>{throw Error.captureStackTrace(d),d}),s.callback=(d,h)=>d?c(d):l(h)}return o&&(a=s.callback,i=setTimeout(()=>{var l=new Error("Query read timeout");process.nextTick(()=>{s.handleError(l,this.connection)}),a(l),s.callback=()=>{};var c=this._queryQueue.indexOf(s);c>-1&&this._queryQueue.splice(c,1),this._pulseQueryQueue()},o),s.callback=(l,c)=>{clearTimeout(i),a(l,c)}),this._queryable?this._ending?(s.native=this.native,process.nextTick(()=>{s.handleError(new Error("Client was closed and is not queryable"))}),n):(this._queryQueue.push(s),this._pulseQueryQueue(),n):(s.native=this.native,process.nextTick(()=>{s.handleError(new Error("Client has encountered a connection error and is not queryable"))}),n)};x.prototype.end=function(t){var e=this;this._ending=!0,this._connected||this.once("connect",this.end.bind(this,t));var r;return t||(r=new this._Promise(function(s,n){t=o=>o?n(o):s()})),this.native.end(function(){e._errorAllQueries(new Error("Connection terminated")),process.nextTick(()=>{e.emit("end"),t&&t()})}),r};x.prototype._hasActiveQuery=function(){return this._activeQuery&&this._activeQuery.state!=="error"&&this._activeQuery.state!=="end"};x.prototype._pulseQueryQueue=function(t){if(this._connected&&!this._hasActiveQuery()){var e=this._queryQueue.shift();if(!e){t||this.emit("drain");return}this._activeQuery=e,e.submit(this);var r=this;e.once("_done",function(){r._pulseQueryQueue()})}};x.prototype.cancel=function(t){this._activeQuery===t?this.native.cancel(function(){}):this._queryQueue.indexOf(t)!==-1&&this._queryQueue.splice(this._queryQueue.indexOf(t),1)};x.prototype.ref=function(){};x.prototype.unref=function(){};x.prototype.setTypeParser=function(t,e,r){return this._types.setTypeParser(t,e,r)};x.prototype.getTypeParser=function(t,e){return this._types.getTypeParser(t,e)}});var Rt=m((Ra,Cs)=>{"use strict";Cs.exports=Es()});var W=m((Na,oe)=>{"use strict";var Di=ds(),Ni=te(),qi=Ct(),Li=ms(),{DatabaseError:Oi}=St(),{escapeIdentifier:Bi,escapeLiteral:Fi}=re(),Qi=t=>class extends Li{constructor(r){super(r,t)}},Dt=function(t){this.defaults=Ni,this.Client=t,this.Query=this.Client.Query,this.Pool=Qi(this.Client),this._pools=[],this.Connection=qi,this.types=ee(),this.DatabaseError=Oi,this.escapeIdentifier=Bi,this.escapeLiteral=Fi};typeof process.env.NODE_PG_FORCE_NATIVE<"u"?oe.exports=new Dt(Rt()):(oe.exports=new Dt(Di),Object.defineProperty(oe.exports,"native",{configurable:!0,enumerable:!1,get(){var t=null;try{t=new Dt(Rt())}catch(e){if(e.code!=="MODULE_NOT_FOUND")throw e}return Object.defineProperty(oe.exports,"native",{value:t}),t}}))});var ji={};qt(ji,{activate:()=>Hi,deactivate:()=>$i});module.exports=Ot(ji);var u=P(require("vscode")),Pe=P(W());var S=P(require("vscode")),ie=P(W()),xe=class t{constructor(e,r){this._disposables=[];this._panel=e,this._extensionUri=r,this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._initialize(),S.workspace.getConfiguration().update("postgresExplorer.connections",[],!0),this._panel.webview.onDidReceiveMessage(async s=>{switch(s.command){case"testConnection":try{let n=new ie.Client({host:s.connection.host,port:s.connection.port,user:s.connection.username,password:s.connection.password,database:s.connection.database});await n.connect();let o=await n.query("SELECT version()");await n.end(),this._panel.webview.postMessage({type:"testSuccess",version:o.rows[0].version})}catch(n){this._panel.webview.postMessage({type:"testError",error:n.message})}break;case"saveConnection":try{let n=new ie.Client({host:s.connection.host,port:s.connection.port,user:s.connection.username,password:s.connection.password,database:"postgres"});await n.connect();let o=await n.query("SELECT datname FROM pg_database WHERE datistemplate = false");await n.end();let i=this.getStoredConnections(),a={id:Date.now().toString(),name:s.connection.name,host:s.connection.host,port:s.connection.port,username:s.connection.username,password:s.connection.password};i.push(a),await this.storeConnections(i),S.window.showInformationMessage("Connection saved successfully!"),S.commands.executeCommand("postgres-explorer.refreshConnections"),this._panel.dispose()}catch(n){let o=n?.message||"Unknown error occurred";S.window.showErrorMessage(`Failed to connect: ${o}`)}break}},void 0,this._disposables)}static show(e){if(t.currentPanel){t.currentPanel._panel.reveal();return}let r=S.window.createWebviewPanel("connectionForm","Add PostgreSQL Connection",S.ViewColumn.One,{enableScripts:!0});t.currentPanel=new t(r,e)}async _initialize(){this._panel.webview.onDidReceiveMessage(async e=>{switch(e.command){case"testConnection":try{let r=new ie.Client({host:e.connection.host,port:e.connection.port,user:e.connection.username,password:e.connection.password,database:e.connection.database});await r.connect();let s=await r.query("SELECT version()");await r.end(),this._panel.webview.postMessage({type:"testSuccess",version:s.rows[0].version})}catch(r){this._panel.webview.postMessage({type:"testError",error:r.message})}break;case"saveConnection":try{let r=new ie.Client({host:e.connection.host,port:e.connection.port,user:e.connection.username,password:e.connection.password,database:"postgres"});await r.connect();let s=await r.query("SELECT datname FROM pg_database WHERE datistemplate = false");await r.end();let n=this.getStoredConnections(),o={id:Date.now().toString(),name:e.connection.name,host:e.connection.host,port:e.connection.port,username:e.connection.username,password:e.connection.password};n.push(o),await this.storeConnections(n),S.window.showInformationMessage("Connection saved successfully!"),S.commands.executeCommand("postgres-explorer.refreshConnections"),this._panel.dispose()}catch(r){let s=r?.message||"Unknown error occurred";S.window.showErrorMessage(`Failed to connect: ${s}`)}break}}),await this._update()}async _update(){this._panel.webview.html=await this._getHtmlForWebview(this._panel.webview)}_getHtmlForWebview(e){return`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Add PostgreSQL Connection</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 30px;
                    gap: 20px;
                }
                .header img {
                    width: 64px;
                    height: 64px;
                }
                .header-text h1 {
                    margin: 0;
                    font-size: 24px;
                    color: var(--vscode-foreground);
                }
                .header-text p {
                    margin: 5px 0 0 0;
                    opacity: 0.8;
                }
                .form-container {
                    max-width: 50%;
                    margin: 0;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--vscode-foreground);
                }
                input, select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                }
                button {
                    padding: 8px 16px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .required::after {
                    content: " *";
                    color: var(--vscode-errorForeground);
                }
                .button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                .message {
                    margin-top: 15px;
                    padding: 10px;
                    border-radius: 3px;
                }
                .error {
                    background: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .success {
                    background: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    color: var(--vscode-inputValidation-infoForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${e.asWebviewUri(S.Uri.joinPath(this._extensionUri,"resources","postgres-explorer.png"))}" alt="PostgreSQL Explorer">
                <div class="header-text">
                    <h1>PostgreSQL Explorer</h1>
                    <p>Connect to your PostgreSQL database and explore your data with ease.</p>
                </div>
            </div>
            <div class="form-container">
                <form id="connectionForm">
                    <div class="form-group">
                        <label for="name" class="required">Connection Name</label>
                        <input type="text" id="name" name="name" required placeholder="My Database Connection">
                    </div>
                    <div class="form-group">
                        <label for="host" class="required">Host</label>
                        <input type="text" id="host" name="host" required placeholder="localhost">
                    </div>
                    <div class="form-group">
                        <label for="port" class="required">Port</label>
                        <input type="number" id="port" name="port" value="5432" required>
                    </div>
                    <div class="form-group">
                        <label for="database">Database</label>
                        <input type="text" id="database" name="database" placeholder="postgres">
                    </div>
                    <div class="form-group">
                        <label for="username" class="required">Username</label>
                        <input type="text" id="username" name="username" required placeholder="postgres">
                    </div>
                    <div class="form-group">
                        <label for="password" class="required">Password</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    <div id="message" style="display: none;" class="message"></div>
                    <div class="button-group">
                        <button type="submit">Add Connection</button>
                        <button type="button" id="testConnection">Test Connection</button>
                    </div>
                </form>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const messageDiv = document.getElementById('message');

                function showMessage(text, isError = false) {
                    messageDiv.textContent = text;
                    messageDiv.className = 'message ' + (isError ? 'error' : 'success');
                    messageDiv.style.display = 'block';
                }

                function getFormData() {
                    return {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value || 'postgres',
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    };
                }

                document.getElementById('testConnection').addEventListener('click', () => {
                    messageDiv.style.display = 'none';
                    vscode.postMessage({
                        command: 'testConnection',
                        connection: getFormData()
                    });
                });

                document.getElementById('connectionForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    messageDiv.style.display = 'none';
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection: getFormData()
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('Connection successful! Server version: ' + message.version);
                            break;
                        case 'testError':
                            showMessage(message.error, true);
                            break;
                    }
                });
            </script>
        </body>
        </html>`}_getNonce(){let e="",r="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let s=0;s<32;s++)e+=r.charAt(Math.floor(Math.random()*r.length));return e}getStoredConnections(){return S.workspace.getConfiguration().get("postgresExplorer.connections")||[]}async storeConnections(e){await S.workspace.getConfiguration().update("postgresExplorer.connections",e,!0)}dispose(){for(t.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};var v=P(require("vscode")),xs=P(W()),ke=class{constructor(){this._onDidChangeTreeData=new v.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event}refresh(e){this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){let r=v.workspace.getConfiguration().get("postgresExplorer.connections")||[];if(!e)return r.map(o=>new A(o.name||`${o.host}:${o.port}`,v.TreeItemCollapsibleState.Collapsed,"connection",o.id));let s=r.find(o=>o.id===e.connectionId);if(!s)return[];let n;try{let o=e.type==="connection"?"postgres":e.databaseName;switch(n=new xs.Client({host:s.host,port:s.port,user:s.username,password:String(s.password),database:o,connectionTimeoutMillis:5e3}),await n.connect(),e.type){case"connection":return(await n.query("SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'")).rows.map(c=>new A(c.datname,v.TreeItemCollapsibleState.Collapsed,"database",e.connectionId,c.datname));case"database":return(await n.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')")).rows.map(c=>new A(c.schema_name,v.TreeItemCollapsibleState.Collapsed,"schema",e.connectionId,e.databaseName,c.schema_name));case"schema":return[new A("Tables",v.TreeItemCollapsibleState.Collapsed,"category",e.connectionId,e.databaseName,e.schema),new A("Views",v.TreeItemCollapsibleState.Collapsed,"category",e.connectionId,e.databaseName,e.schema),new A("Functions",v.TreeItemCollapsibleState.Collapsed,"category",e.connectionId,e.databaseName,e.schema)];case"category":switch(e.label){case"Tables":return(await n.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",[e.schema])).rows.map(p=>new A(p.table_name,v.TreeItemCollapsibleState.Collapsed,"table",e.connectionId,e.databaseName,e.schema));case"Views":return(await n.query("SELECT table_name FROM information_schema.views WHERE table_schema = $1",[e.schema])).rows.map(p=>new A(p.table_name,v.TreeItemCollapsibleState.Collapsed,"view",e.connectionId,e.databaseName,e.schema));case"Functions":return(await n.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION'",[e.schema])).rows.map(p=>new A(p.routine_name,v.TreeItemCollapsibleState.None,"function",e.connectionId,e.databaseName,e.schema))}break;case"table":case"view":return(await n.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",[e.schema,e.label])).rows.map(c=>new A(`${c.column_name} (${c.data_type})`,v.TreeItemCollapsibleState.None,"column",e.connectionId,e.databaseName,e.schema))}return[]}catch(o){return v.window.showErrorMessage(`Failed to get tree items: ${o.message}`),[]}finally{n&&await n.end()}}},A=class extends v.TreeItem{constructor(r,s,n,o,i,a,l,c){super(r,s);this.label=r;this.collapsibleState=s;this.type=n;this.connectionId=o;this.databaseName=i;this.schema=a;this.tableName=l;this.columnName=c;this.contextValue=n,this.iconPath={connection:new v.ThemeIcon("server"),database:new v.ThemeIcon("database"),schema:new v.ThemeIcon("symbol-namespace"),table:new v.ThemeIcon("table"),view:new v.ThemeIcon("eye"),function:new v.ThemeIcon("symbol-method"),column:new v.ThemeIcon("symbol-field"),category:new v.ThemeIcon("folder")}[n]}};var ae=P(require("vscode")),ce=class{static async show(e,r,s,n=!1){try{let o=`
                SELECT 
                    a.attname as column_name,
                    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
                    a.attnotnull as is_not_null,
                    (
                        SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
                        FROM pg_catalog.pg_attrdef d
                        WHERE d.adrelid = a.attrelid
                        AND d.adnum = a.attnum
                        AND a.atthasdef
                    ) as default_value,
                    CASE 
                        WHEN pc.contype = 'p' THEN true
                        ELSE false
                    END as is_primary_key
                FROM pg_catalog.pg_attribute a
                LEFT JOIN pg_catalog.pg_constraint pc 
                    ON pc.conrelid = a.attrelid 
                    AND a.attnum = ANY(pc.conkey)
                    AND pc.contype = 'p'
                WHERE a.attrelid = '${r}.${s}'::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
                ORDER BY a.attnum`,i=n?`SELECT pg_get_viewdef('${r}.${s}'::regclass, true) as definition`:`SELECT pg_get_tabledef('${r}.${s}'::regclass) as definition`,[a,l]=await Promise.all([e.query(o),e.query(i)]),c=n?l.rows[0].definition:l.rows[0].definition.replace(/[<>]/g,p=>p==="<"?"&lt;":"&gt;").replace(/\((.*)\)/s,(p,w)=>`(
  `+w.split(",").map(K=>K.trim()).join(`,
  `)+`
)`),d=ae.window.createWebviewPanel(n?"viewProperties":"tableProperties",`${s} Properties`,ae.ViewColumn.One,{enableScripts:!0}),h=a.rows.map(p=>`
                <tr>
                    <td class="${p.is_primary_key?"pk-column":""} ${p.is_not_null?"required-column":""}">${p.column_name}</td>
                    <td>${p.data_type}</td>
                    <td style="text-align: center;">
                        <input type="checkbox" 
                               class="custom-checkbox" 
                               ${p.is_not_null?"":"checked"} 
                               disabled 
                               title="${p.is_not_null?"Not Nullable":"Nullable"}"
                        >
                    </td>
                    <td>${p.default_value||""}</td>
                    <td style="text-align: center;">
                        <input type="checkbox" 
                               class="custom-checkbox" 
                               ${p.is_primary_key?"checked":""} 
                               disabled 
                               title="${p.is_primary_key?"Primary Key":"Not Primary Key"}"
                        >
                    </td>
                </tr>
            `).join("");d.webview.html=`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { 
                            padding: 16px; 
                            font-family: var(--vscode-editor-font-family);
                            color: var(--vscode-editor-foreground);
                        }
                        .container { display: grid; gap: 16px; }
                        
                        /* Header styles */
                        .header {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            margin-bottom: 20px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid var(--vscode-panel-border);
                        }

                        /* Switch styles */
                        .switch-container {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            opacity: 0.8;
                        }

                        .view-label {
                            font-size: 12px;
                            color: var(--vscode-foreground);
                            opacity: 0.8;
                        }

                        .switch {
                            position: relative;
                            display: inline-block;
                            width: 36px;
                            height: 20px;
                        }

                        .switch input { opacity: 0; width: 0; height: 0; }

                        .slider {
                            position: absolute;
                            cursor: pointer;
                            top: 0; left: 0; right: 0; bottom: 0;
                            background-color: var(--vscode-button-secondaryBackground);
                            transition: .2s;
                            border-radius: 10px;
                            opacity: 0.6;
                        }

                        .slider:before {
                            position: absolute;
                            content: "";
                            height: 14px;
                            width: 14px;
                            left: 3px;
                            bottom: 3px;
                            background-color: var(--vscode-button-foreground);
                            transition: .2s;
                            border-radius: 50%;
                        }

                        input:checked + .slider {
                            background-color: var(--vscode-button-background);
                        }

                        input:checked + .slider:before {
                            transform: translateX(16px);
                        }

                        /* View styles */
                        #tableView, #scriptView { 
                            display: none; 
                            opacity: 0;
                            transition: opacity 0.3s ease-in-out;
                        }
                        #tableView.active, #scriptView.active { 
                            display: block;
                            opacity: 1;
                        }

                        /* Table styles */
                        .table-container {
                            background: var(--vscode-editor-background);
                            border-radius: 6px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                            overflow: hidden;
                        }
                        
                        table { 
                            border-collapse: separate;
                            border-spacing: 0;
                            width: 100%;
                        }
                        
                        th, td { 
                            border: none;
                            padding: 12px 16px;
                            text-align: left;
                        }
                        
                        th {
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-symbolIcon-classForeground);
                            font-weight: 600;
                            font-size: 0.9em;
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                            border-bottom: 2px solid var(--vscode-panel-border);
                        }
                        
                        tr:not(:last-child) td {
                            border-bottom: 1px solid var(--vscode-panel-border);
                        }
                        
                        td {
                            background: var(--vscode-editor-background);
                            font-family: var(--vscode-editor-font-family);
                        }

                        /* Column highlighting */
                        .pk-column {
                            color: var(--vscode-symbolIcon-constantForeground);
                            font-weight: 600;
                        }
                        
                        .required-column {
                            color: var(--vscode-gitDecoration-modifiedResourceForeground);
                        }

                        /* Script View */
                        .script-container {
                            background: var(--vscode-editor-background);
                            border-radius: 6px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                        }
                        
                        pre {
                            margin: 0;
                            padding: 16px;
                            overflow-x: auto;
                            font-family: var(--vscode-editor-font-family);
                            font-size: 13px;
                            line-height: 1.5;
                            color: var(--vscode-editor-foreground);
                        }

                        .keyword { color: var(--vscode-symbolIcon-keywordForeground); }
                        .identifier { color: var(--vscode-symbolIcon-variableForeground); }
                        .type { color: var(--vscode-symbolIcon-typeParameterForeground); }
                        .constraint { color: var(--vscode-symbolIcon-constantForeground); }

                        /* Checkbox styles */
                        .custom-checkbox {
                            appearance: none;
                            width: 16px;
                            height: 16px;
                            border: 1px solid var(--vscode-checkbox-border);
                            background: var(--vscode-checkbox-background);
                            border-radius: 3px;
                            cursor: default;
                            position: relative;
                        }

                        .custom-checkbox:checked {
                            background: var(--vscode-checkbox-selectBackground);
                            border-color: var(--vscode-checkbox-selectBorder);
                        }

                        .custom-checkbox:checked::after {
                            content: "\u2713";
                            position: absolute;
                            color: var(--vscode-checkbox-foreground);
                            font-size: 12px;
                            left: 2px;
                            top: -1px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>${r}.${s}</h2>
                            <div class="switch-container">
                                <span class="view-label">Table</span>
                                <label class="switch">
                                    <input type="checkbox" id="viewSwitch">
                                    <span class="slider"></span>
                                </label>
                                <span class="view-label">Script</span>
                            </div>
                        </div>

                        <div id="tableView" class="table-container active">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Column Name</th>
                                        <th>Data Type</th>
                                        <th style="text-align: center;" title="Check means column is nullable">Nullable</th>
                                        <th>Default</th>
                                        <th style="text-align: center;" title="Check means column is primary key">Primary Key</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${h}
                                </tbody>
                            </table>
                        </div>

                        <div id="scriptView" class="script-container">
                            <pre>${Ui(c)}</pre>
                        </div>
                    </div>

                    <script>
                        const viewSwitch = document.getElementById('viewSwitch');
                        const tableView = document.getElementById('tableView');
                        const scriptView = document.getElementById('scriptView');

                        // Initialize views
                        tableView.classList.add('active');
                        scriptView.classList.remove('active');

                        viewSwitch.addEventListener('change', (e) => {
                            if (e.target.checked) {
                                requestAnimationFrame(() => {
                                    tableView.classList.remove('active');
                                    scriptView.classList.add('active');
                                });
                            } else {
                                requestAnimationFrame(() => {
                                    scriptView.classList.remove('active');
                                    tableView.classList.add('active');
                                });
                            }
                        });

                        // Helper function for SQL syntax highlighting
                        function formatSqlWithHighlighting(sql) {
                            const escapeHtml = (text) => {
                                return text
                                    .replace(/&/g, "&amp;")
                                    .replace(/</g, "&lt;")
                                    .replace(/>/g, "&gt;");
                            };
                            
                            return escapeHtml(sql)
                                .replace(/\b(CREATE TABLE|PRIMARY KEY|NOT NULL)\b/g, '<span class="keyword">$1</span>')
                                .replace(/\b(integer|text|boolean|timestamp|numeric|character varying|without time zone)\b/g, '<span class="type">$1</span>')
                                .replace(/(w+).(w+)/g, '<span class="identifier">$1</span>.<span class="identifier">$2</span>');
                        }
                    </script>
                </body>
                </html>`}catch(o){ae.window.showErrorMessage(`Error loading properties: ${o.message}`)}}};function Ui(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\b(CREATE TABLE|PRIMARY KEY|NOT NULL|NULL)\b/g,'<span class="keyword">$1</span>').replace(/\b(integer|text|boolean|timestamp|numeric|character varying|without time zone)\b/g,'<span class="type">$1</span>').replace(/(\w+)\.(\w+)/g,'<span class="identifier">$1</span>.<span class="identifier">$2</span>').replace(/\b(PRIMARY KEY)\b/g,'<span class="constraint">$1</span>')}var k=P(require("vscode")),Te=class{async deserializeNotebook(e,r){let s,n=[];if(e.byteLength>0)try{let i=JSON.parse(Buffer.from(e).toString());i.metadata&&(s=i.metadata),Array.isArray(i.cells)&&(n=i.cells.map(a=>new k.NotebookCellData(k.NotebookCellKind.Code,a.value,"sql")))}catch{n=[new k.NotebookCellData(k.NotebookCellKind.Code,`-- Write your SQL query here
SELECT NOW();`,"sql")]}else n=[new k.NotebookCellData(k.NotebookCellKind.Code,`-- Write your SQL query here
SELECT NOW();`,"sql")];let o=new k.NotebookData(n);return o.metadata={...s,custom:{cells:[],metadata:{...s,enableScripts:!0}}},o}async serializeNotebook(e,r){let s=e.cells.map(n=>({value:n.value}));return Buffer.from(JSON.stringify({metadata:e.metadata,cells:s}))}};var M=P(require("vscode")),ks=P(W()),Ie=class{constructor(e){this.id="postgres-kernel";this.label="PostgreSQL Kernel";console.log("PostgresKernel: Initializing"),this.controller=M.notebooks.createNotebookController(this.id,"postgres-notebook",this.label),this.messageHandler=e,console.log("PostgresKernel: Message handler registered:",!!e),this.controller.supportedLanguages=["sql"],this.controller.supportsExecutionOrder=!0,this.controller.description="PostgreSQL Query Executor",this.controller.executeHandler=this._executeAll.bind(this)}async _executeAll(e,r,s){for(let n of e)await this._doExecution(n)}async _doExecution(e){console.log("PostgresKernel: Starting cell execution");let r=this.controller.createNotebookCellExecution(e);r.start(Date.now());try{let s=e.notebook.metadata;if(!s)throw new Error("No connection metadata found");let n=new ks.Client({host:s.host,port:s.port,user:s.username,password:String(s.password),database:s.databaseName});await n.connect(),console.log("PostgresKernel: Connected to database");let o=e.document.getText(),i=await n.query(o);if(await n.end(),i.fields.length>0){console.log("PostgresKernel: Query returned",i.rows.length,"rows");let a=i.fields.map(h=>h.name),l=i.rows,c=`
                    <style>
                        .output-controls {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 16px;
                            gap: 8px;
                        }
                        .export-container {
                            position: relative;
                            display: inline-block;
                        }
                        .export-button {
                            background: transparent;
                            color: var(--vscode-foreground);
                            border: 1px solid var(--vscode-button-border);
                            padding: 4px 8px;
                            cursor: pointer;
                            border-radius: 2px;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            min-width: 32px;
                            justify-content: center;
                            opacity: 0.8;
                        }
                        .export-button:hover {
                            opacity: 1;
                            background: var(--vscode-button-secondaryHoverBackground);
                        }
                        .export-menu {
                            display: none;
                            position: absolute;
                            top: 100%;
                            left: 0;
                            background: var(--vscode-menu-background);
                            border: 1px solid var(--vscode-menu-border);
                            border-radius: 2px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                            z-index: 1000;
                            min-width: 160px;
                        }
                        .export-menu.show {
                            display: block;
                        }
                        .export-option {
                            padding: 8px 16px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            color: var(--vscode-menu-foreground);
                            text-decoration: none;
                            white-space: nowrap;
                            opacity: 0.8;
                        }
                        .export-option:hover {
                            background: var(--vscode-list-hoverBackground);
                            opacity: 1;
                        }
                        .clear-button {
                            opacity: 0.6;
                        }
                        .clear-button:hover {
                            opacity: 0.8;
                        }
                        .icon {
                            width: 16px;
                            height: 16px;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .table-container {
                            max-height: 400px;
                            overflow: auto;
                            border: 1px solid var(--vscode-panel-border);
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        th, td {
                            padding: 8px;
                            text-align: left;
                            border: 1px solid var(--vscode-panel-border);
                        }
                        th {
                            background: var(--vscode-editor-background);
                            position: sticky;
                            top: 0;
                        }
                        tr:nth-child(even) {
                            background: var(--vscode-list-hoverBackground);
                        }
                        .hidden {
                            display: none !important;
                        }
                    </style>
                    <div class="output-wrapper">
                        <div class="output-controls">
                            <div class="export-container">
                                <button class="export-button" onclick="toggleExportMenu()" title="Export options">
                                    <span class="icon">\u{1F5C3}\uFE0F</span>
                                </button>
                                <div class="export-menu" id="exportMenu">
                                    <a href="#" class="export-option" onclick="downloadCSV(); return false;">
                                        <span class="icon">\u{1F4C4}</span> CSV
                                    </a>
                                    <a href="#" class="export-option" onclick="downloadExcel(); return false;">
                                        <span class="icon">\u{1F4CA}</span> Excel
                                    </a>
                                    <a href="#" class="export-option" onclick="downloadJSON(); return false;">
                                        <span class="icon">{ }</span> JSON
                                    </a>
                                </div>
                            </div>
                            <button class="export-button clear-button" onclick="clearOutput()" title="Clear output">
                                <span class="icon">\u274C</span>
                            </button>
                        </div>
                        <div class="output-content">
                            <div class="table-container">
                                <table id="resultTable">
                                    <thead>
                                        <tr>${a.map(h=>`<th>${h}</th>`).join("")}</tr>
                                    </thead>
                                    <tbody>
                                        ${l.map(h=>`<tr>${a.map(p=>{let w=h[p];return`<td>${w===null?"":w}</td>`}).join("")}</tr>`).join("")}
                                    </tbody>
                                </table>
                            </div>
                            <div>${l.length} rows</div>
                        </div>
                    </div>
                    <script>
                        // Close export menu when clicking outside
                        document.addEventListener('click', function(event) {
                            const menu = document.getElementById('exportMenu');
                            const button = event.target.closest('.export-button');
                            if (!button && menu.classList.contains('show')) {
                                menu.classList.remove('show');
                            }
                        });

                        function toggleExportMenu() {
                            const menu = document.getElementById('exportMenu');
                            menu.classList.toggle('show');
                        }

                        function clearOutput() {
                            const wrapper = document.querySelector('.output-wrapper');
                            wrapper.classList.add('hidden');
                        }

                        function downloadCSV() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                                Array.from(row.querySelectorAll('td')).map(cell => {
                                    const val = cell.textContent || '';
                                    return val.includes(',') || val.includes('"') || val.includes('\\n') ?
                                        '"' + val.replace(/"/g, '""') + '"' :
                                        val;
                                })
                            );

                            const csv = [
                                headers.join(','),
                                ...rows.map(row => row.join(','))
                            ].join('\\n');

                            downloadFile(csv, 'query_result.csv', 'text/csv');
                        }

                        function downloadJSON() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
                                const rowData = {};
                                Array.from(row.querySelectorAll('td')).forEach((cell, index) => {
                                    rowData[headers[index]] = cell.textContent || '';
                                });
                                return rowData;
                            });

                            const json = JSON.stringify(rows, null, 2);
                            downloadFile(json, 'query_result.json', 'application/json');
                        }

                        function downloadExcel() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                                Array.from(row.querySelectorAll('td')).map(cell => cell.textContent || '')
                            );

                            let xml = '<?xml version="1.0"?>\\n<?mso-application progid="Excel.Sheet"?>\\n';
                            xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\\n';
                            xml += '<Worksheet ss:Name="Query Result"><Table>\\n';
                            
                            xml += '<Row>' + headers.map(h => 
                                '<Cell><Data ss:Type="String">' + 
                                (h || '').replace(/[<>&]/g, c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;') + 
                                '</Data></Cell>'
                            ).join('') + '</Row>\\n';
                            
                            rows.forEach(row => {
                                xml += '<Row>' + row.map(cell => {
                                    const value = cell || '';
                                    return '<Cell><Data ss:Type="String">' + 
                                        value.toString().replace(/[<>&]/g, c => 
                                            c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
                                        ) + 
                                        '</Data></Cell>';
                                }).join('') + '</Row>\\n';
                            });
                            
                            xml += '</Table></Worksheet></Workbook>';
                            downloadFile(xml, 'query_result.xls', 'application/vnd.ms-excel');
                        }

                        function downloadFile(content, filename, type) {
                            const blob = new Blob([content], { type });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(a.href);
                            // Close the export menu after downloading
                            document.getElementById('exportMenu').classList.remove('show');
                        }
                    </script>`,d=new M.NotebookCellOutput([M.NotebookCellOutputItem.text(c,"text/html")]);d.metadata={outputType:"display_data",custom:{vscode:{cellId:e.document.uri.toString(),controllerId:this.id,enableScripts:!0}}},r.replaceOutput([d]),r.end(!0),console.log("PostgresKernel: Cell execution completed successfully")}else{let a=new M.NotebookCellOutput([M.NotebookCellOutputItem.text("<div>No results</div>","text/html")]);r.replaceOutput([a]),r.end(!0)}}catch(s){console.error("PostgresKernel: Cell execution failed:",s),r.replaceOutput([new M.NotebookCellOutput([M.NotebookCellOutputItem.error({name:"Error",message:s.message||"Unknown error occurred"})])]),r.end(!1)}}dispose(){this.controller.dispose()}};var D=P(require("vscode")),Ae=class{async deserializeNotebook(e,r){let s=new TextDecoder().decode(e),n;try{n=JSON.parse(s)}catch{n={cells:[]}}let o=n.cells.map(i=>new D.NotebookCellData(i.kind==="markdown"?D.NotebookCellKind.Markup:D.NotebookCellKind.Code,i.value,i.language));return new D.NotebookData(o)}async serializeNotebook(e,r){let s=e.cells.map(n=>({kind:n.kind===D.NotebookCellKind.Markup?"markdown":"sql",value:n.value,language:n.kind===D.NotebookCellKind.Markup?"markdown":"sql"}));return new TextEncoder().encode(JSON.stringify({cells:s}))}};function Hi(t){console.log("postgres-explorer: Activating extension");let e=new Ie(o=>{console.log("Extension: Received message from kernel:",o),o.type==="custom"&&o.command==="export"&&(console.log("Extension: Handling export command"),u.commands.executeCommand("postgres-explorer.exportData",{format:o.format,content:o.content,filename:o.filename}))});t.subscriptions.push(e),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.exportData",async o=>{console.log("Extension: Export command triggered with args:",o);try{let{format:i,content:a,filename:l}=o,c=await u.window.showSaveDialog({defaultUri:u.Uri.file(l),filters:{"CSV files":["csv"],"Excel files":["xls","xlsx"]},saveLabel:`Export as ${i.toUpperCase()}`});console.log("Extension: Save dialog result:",c?.fsPath),c&&(console.log("Extension: Writing file content, size:",a.length),await u.workspace.fs.writeFile(c,Buffer.from(a,"utf-8")),console.log("Extension: File written successfully"),u.window.showInformationMessage(`Successfully exported to ${c.fsPath}`))}catch(i){console.error("Extension: Export failed:",i),u.window.showErrorMessage(`Export failed: ${i.message}`)}})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.saveFile",async o=>{try{console.log("Saving file with args:",o);let{content:i,filename:a,type:l}=o,c=await u.window.showSaveDialog({defaultUri:u.Uri.file(a),filters:{"CSV files":["csv"],"Excel files":["xls","xlsx"]},saveLabel:`Export as ${l.toUpperCase()}`});c&&(await u.workspace.fs.writeFile(c,Buffer.from(i)),u.window.showInformationMessage(`Successfully exported to ${c.fsPath}`))}catch(i){console.error("Save file failed:",i),u.window.showErrorMessage(`Export failed: ${i.message}`)}}));let r=new ke,s=new Te;t.subscriptions.push(u.workspace.registerNotebookSerializer("postgres-notebook",s)),t.subscriptions.push(u.workspace.registerNotebookSerializer("postgres-query",new Ae)),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.addConnection",()=>{xe.show(t.extensionUri)})),t.subscriptions.push(u.window.registerTreeDataProvider("postgresExplorer",r));let n=u.window.createTreeView("postgresExplorer",{treeDataProvider:r,showCollapseAll:!0});t.subscriptions.push(u.commands.registerCommand("postgres-explorer.refreshConnections",()=>{r.refresh()})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.showTableProperties",async o=>{if(!o||!o.schema||!o.connectionId){u.window.showErrorMessage("Invalid table selection");return}let a=(u.workspace.getConfiguration().get("postgresExplorer.connections")||[]).find(c=>c.id===o.connectionId);if(!a){u.window.showErrorMessage("Connection not found");return}let l;try{l=new Pe.Client({host:a.host,port:a.port,user:a.username,password:String(a.password),database:o.databaseName||a.database,connectionTimeoutMillis:5e3}),await l.connect(),await ce.show(l,o.schema,o.label)}catch(c){let d=c?.message||"Unknown error occurred";if(u.window.showErrorMessage(`Failed to show table properties: ${d}`),l)try{await l.end()}catch(h){console.error("Error closing connection:",h)}}})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.showViewProperties",async o=>{if(!o||!o.schema||!o.connectionId){u.window.showErrorMessage("Invalid view selection");return}let a=(u.workspace.getConfiguration().get("postgresExplorer.connections")||[]).find(c=>c.id===o.connectionId);if(!a){u.window.showErrorMessage("Connection not found");return}let l;try{l=new Pe.Client({host:a.host,port:a.port,user:a.username,password:String(a.password),database:o.databaseName||a.database,connectionTimeoutMillis:5e3}),await l.connect(),await ce.show(l,o.schema,o.label,!0)}catch(c){let d=c?.message||"Unknown error occurred";if(u.window.showErrorMessage(`Failed to show view properties: ${d}`),l)try{await l.end()}catch(h){console.error("Error closing connection:",h)}}})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.connect",async()=>{try{let o=await u.window.showInputBox({prompt:"Enter PostgreSQL connection string",placeHolder:"postgresql://user:password@localhost:5432/dbname"});if(!o)return;let i=new Pe.Client(o);await i.connect(),u.window.showInformationMessage("Connected to PostgreSQL database"),r.refresh(),await i.end()}catch(o){let i=o?.message||"Unknown error occurred";u.window.showErrorMessage(`Failed to connect: ${i}`)}})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.disconnect",async()=>{r.refresh(),u.window.showInformationMessage("Disconnected from PostgreSQL database")})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.refresh",()=>{r.refresh()})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.queryTable",async o=>{if(!o||!o.schema)return;let i=`SELECT * FROM ${o.schema}.${o.label} LIMIT 100;`,a=await u.workspace.openNotebookDocument("postgres-notebook",new u.NotebookData([new u.NotebookCellData(u.NotebookCellKind.Code,i,"sql")]));await u.window.showNotebookDocument(a)})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.newNotebook",async o=>{if(!o){u.window.showErrorMessage("Please select a database, schema, or table to create a notebook");return}let a=(u.workspace.getConfiguration().get("postgresExplorer.connections")||[]).find(h=>h.id===o.connectionId);if(!a){u.window.showErrorMessage("Connection not found");return}let l={connectionId:o.connectionId,databaseName:o.databaseName||o.label,host:a.host,port:a.port,username:a.username,password:a.password},c=new u.NotebookData([new u.NotebookCellData(u.NotebookCellKind.Code,`-- Connected to database: ${l.databaseName}
-- Write your SQL query here
SELECT * FROM ${o.schema?`${o.schema}.${o.label}`:"your_table"}
LIMIT 100;`,"sql")]);c.metadata=l;let d=await u.workspace.openNotebookDocument("postgres-notebook",c);await u.window.showNotebookDocument(d)})),t.subscriptions.push(u.commands.registerCommand("postgres-explorer.deleteConnection",async o=>{if(await u.window.showWarningMessage(`Are you sure you want to delete connection '${o.label}'?`,"Yes","No")==="Yes"){let a=u.workspace.getConfiguration(),c=(a.get("postgresExplorer.connections")||[]).filter(d=>d.id!==o.connectionId);await a.update("postgresExplorer.connections",c,u.ConfigurationTarget.Global),r.refresh()}}))}function $i(){}0&&(module.exports={activate,deactivate});
