import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const outputPath = path.join(
  projectRoot,
  'Contract_Rupa_Chaulagain_JobBot_Test_Development_Engineer.pdf'
);

const contract = {
  contractorName: 'Rupa Chaulagain',
  role: 'Test and Development Engineer',
  projectName: 'Job Bot by Inquisitive Mind',
  startDate: '25 February 2025',
  endDate: '25 April 2025',
  duration: '2 months',
  monthlyPayAUD: '500',
  documentDate: '25 February 2025',
  employerName: '[Employer Legal Name]',
  employerAddress: '[Address]',
  employerABN: '[ABN]',
};

function addParagraph(doc, text, options = {}) {
  doc.fontSize(options.size || 11).text(text, { align: options.align || 'left', continued: false, lineGap: 2 });
  doc.moveDown(options.spaceAfter ?? 0.4);
}

function addHeading(doc, text, size = 12) {
  doc.fontSize(size).text(text, { align: 'left' });
  doc.moveDown(0.35);
}

async function generate() {
  const doc = new PDFDocument({ margin: 72, size: 'A4', lineGap: 2 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).text('SERVICE AGREEMENT', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text('Contract for Services – Test and Development Engineer', { align: 'center' });
  doc.moveDown(1);

  addParagraph(doc, `This Service Agreement ("Agreement") is entered into as of ${contract.documentDate} ("Effective Date") by and between the following parties.`);
  doc.moveDown(0.6);

  addHeading(doc, '1. DEFINITIONS AND PARTIES', 12);
  addParagraph(doc, '1.1 Parties. This Agreement is between:');
  addParagraph(doc, `(a) ${contract.employerName}, with its principal place of business at ${contract.employerAddress}, ABN: ${contract.employerABN} ("Company"); and`);
  addParagraph(doc, `(b) ${contract.contractorName} ("Contractor").`);
  addParagraph(doc, `1.2 The "Project" means the software application known as ${contract.projectName}, including all related systems, documentation, and deliverables. "Services" means the testing and development work performed by the Contractor under this Agreement.`);
  doc.moveDown(0.3);

  addHeading(doc, '2. ENGAGEMENT AND ROLE', 12);
  addParagraph(doc, `2.1 The Company engages the Contractor, and the Contractor agrees to provide services, in the capacity of ${contract.role} for the Project.`);
  addParagraph(doc, '2.2 The Contractor shall perform such duties and responsibilities as are reasonably assigned by the Company, including but not limited to: designing and executing test plans; identifying, documenting, and assisting in the resolution of defects; developing, modifying, and maintaining code or configurations as directed; collaborating with the Company on requirements and acceptance criteria; and providing written or verbal progress updates as requested.');
  addParagraph(doc, '2.3 The Contractor shall perform the Services with due skill, care, and diligence and in accordance with any timelines or priorities communicated by the Company.');
  doc.moveDown(0.3);

  addHeading(doc, '3. TERM', 12);
  addParagraph(doc, `3.1 The term of this Agreement begins on ${contract.startDate} and ends on ${contract.endDate}, being a period of ${contract.duration} ("Term"), unless earlier terminated in accordance with clause 7.`);
  addParagraph(doc, '3.2 Unless the parties agree in writing to extend or renew the Term, this Agreement shall expire automatically at the end of the Term, with no further obligation except for those that by their nature survive termination.');
  doc.moveDown(0.3);

  addHeading(doc, '4. REMUNERATION AND PAYMENT', 12);
  addParagraph(doc, `4.1 In consideration of the Services, the Company shall pay the Contractor ${contract.monthlyPayAUD} Australian Dollars (AUD) per month ("Monthly Fee").`);
  addParagraph(doc, '4.2 Payment shall be made monthly in arrears, within a reasonable period (e.g. 14 days) after the end of each calendar month, to a bank account or method nominated by the Contractor in writing.');
  addParagraph(doc, '4.3 The Contractor is responsible for all taxes, superannuation (if any), and statutory obligations applicable to the Contractor. The Company does not withhold tax or superannuation unless required by law.');
  addParagraph(doc, '4.4 If the Agreement starts or ends partway through a month, the Monthly Fee may be prorated as agreed by the parties.');
  doc.moveDown(0.3);

  addHeading(doc, '5. CONFIDENTIALITY', 12);
  addParagraph(doc, "5.1 The Contractor shall keep confidential all information disclosed by or on behalf of the Company in connection with this Agreement or the Project, including business, technical, and user data (\"Confidential Information\"). The Contractor shall not use Confidential Information except as necessary to perform the Services and shall not disclose it to any third party without the Company's prior written consent.");
  addParagraph(doc, '5.2 The obligations in this clause 5 survive termination of this Agreement and continue for so long as the information remains confidential.');
  doc.moveDown(0.3);

  addHeading(doc, '6. INTELLECTUAL PROPERTY', 12);
  addParagraph(doc, '6.1 All intellectual property rights (including copyright, patents, and rights in designs and know-how) in any work product, deliverables, code, documentation, or other materials created by the Contractor in the course of performing the Services ("Work Product") shall vest in and be owned by the Company.');
  addParagraph(doc, '6.2 To the extent that any such rights do not automatically vest in the Company, the Contractor hereby assigns to the Company all right, title, and interest in and to the Work Product. The Contractor shall execute any further documents and do any further acts reasonably required to give effect to this assignment.');
  addParagraph(doc, '6.3 The Contractor shall not use, reproduce, or exploit any Work Product for any purpose other than performing the Services or as authorised by the Company in writing.');
  doc.moveDown(0.3);

  addHeading(doc, '7. TERMINATION', 12);
  addParagraph(doc, "7.1 Either party may terminate this Agreement by giving the other party not less than fourteen (14) days' prior written notice, or such shorter period as the parties may agree in writing.");
  addParagraph(doc, '7.2 The Company may terminate this Agreement immediately on written notice if the Contractor materially breaches this Agreement and fails to remedy the breach within a reasonable time after written notice, or if the Contractor becomes insolvent or commits a serious act of misconduct.');
  addParagraph(doc, '7.3 On termination or expiry, the Company shall pay the Contractor for all Services properly performed up to the date of termination that have not already been paid. The Contractor shall promptly return or destroy all Confidential Information and materials belonging to the Company.');
  doc.moveDown(0.3);

  addHeading(doc, '8. LIABILITY AND INDEMNITY', 12);
  addParagraph(doc, "8.1 To the maximum extent permitted by law, the Company's total liability under this Agreement shall not exceed the total amount of fees paid or payable to the Contractor in the three (3) months preceding the event giving rise to the claim.");
  addParagraph(doc, "8.2 The Contractor shall indemnify the Company against any loss, damage, or expense (including reasonable legal costs) arising from the Contractor's breach of this Agreement, negligence, or wilful misconduct in performing the Services.");
  doc.moveDown(0.3);

  addHeading(doc, '9. GENERAL', 12);
  addParagraph(doc, '9.1 Entire agreement. This Agreement constitutes the entire agreement between the parties and supersedes any prior arrangements or understandings relating to the subject matter.');
  addParagraph(doc, '9.2 Amendments. Any amendment to this Agreement must be in writing and signed by both parties.');
  addParagraph(doc, '9.3 Notices. Notices under this Agreement shall be in writing and sent to the address or email last notified by each party and shall be deemed received when delivered or, if sent by email, when receipt is confirmed.');
  addParagraph(doc, '9.4 Severability. If any provision is held invalid or unenforceable, the remainder of this Agreement shall continue in full force and effect.');
  addParagraph(doc, '9.5 Governing law. This Agreement is governed by the laws of Australia. The parties submit to the non-exclusive jurisdiction of the courts of Australia.');
  doc.moveDown(0.8);

  addHeading(doc, 'SIGNATURES', 12);
  addParagraph(doc, 'The parties have executed this Agreement as of the Effective Date.');
  doc.moveDown(0.8);

  doc.fontSize(10).text('For the Company:', { continued: false });
  doc.moveDown(1);
  doc.text('_________________________', { continued: false });
  doc.text('Signature', { continued: false });
  doc.moveDown(0.3);
  doc.text('Name:', { continued: false });
  doc.text('Title:', { continued: false });
  doc.text('Date:', { continued: false });
  doc.moveDown(1);

  doc.text('Contractor:', { continued: false });
  doc.moveDown(1);
  doc.text('_________________________', { continued: false });
  doc.text('Signature', { continued: false });
  doc.moveDown(0.3);
  doc.text(`Name: ${contract.contractorName}`, { continued: false });
  doc.text('Date:', { continued: false });

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log('Created:', outputPath);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
