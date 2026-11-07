import { parseIndexedPassages } from '../memorySearch';
const hit={text:'passage',document_id:'12345678-1234-1234-1234-123456789abc',document_name:'source'};
test.each([[hit], [[hit]], [{dataset_id:'ds',search_result:[hit]}]])('actual backend envelopes retain ranked passages %p', wire => {
 expect(parseIndexedPassages(wire)).toEqual([{text:'passage',documentId:hit.document_id,name:'source'}]);
});
test('chunk id is never used as source id',()=>{
 expect(parseIndexedPassages([{text:'a',id:hit.document_id},{text:'b',document_id:'bad'}]).map(h=>h.documentId)).toEqual([null,null]);
});
test.each([null, {}, [{text:42}], [{error:'unavailable',search_result:[]}]])('rejects invalid wire without inventing text %p', wire=>{
 expect(()=>parseIndexedPassages(wire)).toThrow();
});
