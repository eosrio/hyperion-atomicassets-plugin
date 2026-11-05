// Inert lifecycle seam: first failure survives cleanup; every closer is attempted.
export async function lifecycle(report,{work,closers,persist}) {
  const describe=e=>({name:e?.name??'Error',code:e?.code??null,message:String(e?.message??e).slice(0,2048)});
  let primary,hasPrimary=false,persistenceFailed=false;
  const retain=e=>{if(!hasPrimary){primary=e;hasPrimary=true;report.error=describe(e);}};
  try {report.result=await work();report.status='passed';}
  catch(e){report.status='failed';retain(e);}
  finally {
    report.cleanup=[];
    for(const [name,close]of closers){const row={name,attempted:true};report.cleanup.push(row);
      try{await close();row.succeeded=true;}catch(e){row.succeeded=false;row.error=describe(e);report.status='failed';retain(e);}
    }
    try{await persist(report);}catch(e){persistenceFailed=true;report.status='failed';report.persistenceError=describe(e);retain(e);}
  }
  // Normal failed-work reports retain the existing return contract. If reporting
  // itself cannot complete, propagate the actual first thrown value unchanged.
  if(persistenceFailed)throw primary;
  return report;
}
