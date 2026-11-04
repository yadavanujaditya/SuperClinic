// Generates e2e/fixtures/test-paediatrics-handbook.pdf — a short ORIGINAL test text
// (not copied from any textbook) used by the Notebook end-to-end test.
const { chromium } = require('playwright');
const pages = [
  ['Respiratory and Febrile Illness in Children', 'A practical test handbook for the SuperClinic notebook. Each page covers one common presentation seen in a paediatric outpatient department.'],
  ['Acute Bronchiolitis', 'Acute bronchiolitis is a viral infection of the small airways that mainly affects infants under two years of age. The illness usually starts with a runny nose and mild fever for two to three days. Cough, fast breathing and wheeze follow as the small airways become inflamed. Respiratory syncytial virus is the most common cause. Most infants need only supportive care with nasal saline, small frequent feeds and oxygen if saturation is low. Bronchodilators and antibiotics are not routinely recommended.'],
  ['Pneumonia', 'Pneumonia should be considered in any child with cough or difficult breathing together with fast breathing. Fast breathing means a respiratory rate of 50 or more per minute in infants aged two to twelve months. Lower chest indrawing is a danger sign that needs admission. Cyanosis, inability to feed and convulsions are also danger signs. Oral amoxicillin is the first choice for pneumonia without danger signs.'],
  ['Enteric Fever', 'Enteric fever should be suspected in a child with fever lasting more than seven days without another clear focus. Abdominal pain, a coated tongue and a soft spleen may be present. Blood culture is the investigation of choice in the first week of illness. A single Widal test is unreliable and should not be used alone to make the diagnosis.'],
  ['Prolonged Cough', 'A cough lasting more than two weeks needs evaluation for tuberculosis, especially with weight loss or contact with an adult who has tuberculosis. Ask about the duration of cough, fever pattern, weight loss and any known contact. A chest radiograph and testing of gastric aspirate or sputum help confirm the diagnosis.'],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<html><body style="font-family: Georgia, serif; font-size: 15px; line-height: 1.6">${pages.map(([h, t], i) =>
    `<section style="page-break-after: ${i < pages.length - 1 ? 'always' : 'auto'}; padding: 40px"><h1 style="font-size:22px">${h}</h1><p>${t}</p></section>`).join('')}</body></html>`);
  await p.pdf({ path: __dirname + '/fixtures/test-paediatrics-handbook.pdf', format: 'A5' });
  await b.close();
  console.log('written');
})();
