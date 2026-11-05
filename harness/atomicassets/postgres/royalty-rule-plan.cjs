'use strict';
// Synthetic contract rows: never represent these as chain chronology or source authority.
const attribute=(index,weight='9223372036854775807')=>({index,source:0,field:'name',value:['string','Gold'],weight,recipients:[{recipient:'alice',weight:5}],lookup_hash:'ab'.repeat(32)});
const template=template_id=>({template_id,recipients:[{recipient:'alice',weight:5}]});
const steps=[
 {name:'insert',rows:[...['0','1','2','3','4','5','6','7','8','9','10','11'].map(x=>({table:'royaltytemp',value:template(x)})),{table:'royaltyattr',value:attribute('1')},{table:'royaltyattr',value:attribute('2','-9223372036854775808')}]},
 {name:'update',rows:[{table:'royaltytemp',value:{...template('1'),recipients:[]}},{table:'royaltyattr',value:{...attribute('1','0'),field:'updated'}}]},
 {name:'delete',rows:[{table:'royaltytemp',value:template('1'),present:false},{table:'royaltyattr',value:attribute('1'),present:false}]},
 {name:'recreate',rows:[{table:'royaltytemp',value:template('1')},{table:'royaltyattr',value:attribute('1','-9223372036854775808')}]},
];
const cases=[
 {name:'attribute-all',route:'attributes'}, {name:'attribute-zero',route:'attributes',query:{source:'0'}},
 {name:'attribute-field',route:'attributes',query:{field:'name'}}, {name:'attribute-invalid',route:'attributes',query:{source:'-1'}},
 {name:'attribute-body-query',route:'attributes',method:'POST',query:{source:'1',field:'not-name'},body:{source:'0',field:'name'}},
 {name:'attribute-head',route:'attributes',method:'HEAD'},
 {name:'template-all',route:'templates'}, {name:'template-one',route:'templates',query:{template_id:'1'}},
 {name:'template-two',route:'templates',query:{template_id:'1,2'}}, {name:'template-ten',route:'templates',query:{template_id:'1,2,3,4,5,6,7,8,9,10'}},
 {name:'template-eleven',route:'templates',query:{template_id:'1,2,3,4,5,6,7,8,9,10,11'}},
 {name:'template-weak',route:'templates',query:{template_id:'001,-2,-0'}}, {name:'template-invalid',route:'templates',query:{template_id:'+1',page:'0'}},
 {name:'template-body-query',route:'templates',method:'POST',query:{template_id:'2',limit:'2'},body:{template_id:'1',limit:'1'}}, {name:'template-head',route:'templates',method:'HEAD'}
];
module.exports={steps,cases};
