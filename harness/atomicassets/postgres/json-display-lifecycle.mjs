// Inert lifecycle seam: first failure survives cleanup; every closer is attempted.
export async function lifecycle(report,{work,closers,persist}) {
  const describe=e=>({name:e?.name??'Error',code:e?.code??null,message:String(e?.message??e).slice(0,2048)});
  try {report.result=await work();report.status='passed';}
  catch(e){report.status='failed';report.error=describe(e);}
  finally {
    report.cleanup=[];
    for(const [name,close]of closers){const row={name,attempted:true};report.cleanup.push(row);
      try{await close();row.succeeded=true;}catch(e){row.succeeded=false;row.error=describe(e);report.status='failed';if(!report.error)report.error=row.error;}
    }
    await persist(report);
  }
  return report;
}
