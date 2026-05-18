async()=>{ try{ console.log(await import.meta.url); await import('stream-json/streamers/stream-object.js'); console.log('ok') }catch(e){ console.error(e) } })();
