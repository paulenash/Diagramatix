const fs = require('fs');
const JSZip = require('./diagramatix/node_modules/jszip');

async function generate() {
  const buf = fs.readFileSync('./BPMN Diagram Shapes v4.6.vssx');
  const stencil = await JSZip.loadAsync(buf);

  const zip = new JSZip();

  // Copy all stencil files
  for (const [path, entry] of Object.entries(stencil.files)) {
    if (!entry.dir) {
      zip.file(path, await entry.async('uint8array'));
    }
  }

  // Fix content types
  let ct = await stencil.file('[Content_Types].xml').async('string');
  ct = ct.replace('application/vnd.ms-visio.stencil.main+xml',
                   'application/vnd.ms-visio.drawing.main+xml');
  ct = ct.replace('</Types>',
    '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>');
  zip.file('[Content_Types].xml', ct);

  // Pages rels
  zip.file('visio/pages/_rels/pages.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>' +
    '</Relationships>');

  // Pages
  zip.file('visio/pages/pages.xml',
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<Pages xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    "<Page ID='0' NameU='Page-1' Name='Page-1' ViewScale='-1' ViewCenterX='5' ViewCenterY='4'>" +
    "<PageSheet LineStyle='0' FillStyle='0' TextStyle='0'>" +
    "<Cell N='PageWidth' V='11'/>" +
    "<Cell N='PageHeight' V='8.5'/>" +
    "<Cell N='ShdwOffsetX' V='0.118'/>" +
    "<Cell N='ShdwOffsetY' V='-0.118'/>" +
    "<Cell N='PageScale' V='1' U='IN_F'/>" +
    "<Cell N='DrawingScale' V='1' U='IN_F'/>" +
    "<Cell N='DrawingSizeType' V='0'/>" +
    "<Cell N='DrawingScaleType' V='0'/>" +
    "<Cell N='InhibitSnap' V='0'/>" +
    "<Cell N='UIVisibility' V='0'/>" +
    "<Cell N='ShdwType' V='0'/>" +
    "<Cell N='ShdwObliqueAngle' V='0'/>" +
    "<Cell N='ShdwScaleFactor' V='1'/>" +
    "<Cell N='DrawingResizeType' V='1'/>" +
    "<Cell N='PageShapeSplit' V='1'/>" +
    "</PageSheet>" +
    "<Rel r:id='rId1'/>" +
    "</Page></Pages>");

  // Page content — THREE separate shapes
  zip.file('visio/pages/page1.xml',
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<PageContents xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    "<Shapes>" +
    "<Shape ID='1' NameU='Task 1' Type='Shape' Master='2'>" +
    "<Cell N='PinX' V='2'/><Cell N='PinY' V='4'/>" +
    "<Cell N='Width' V='1.5'/><Cell N='Height' V='0.75'/>" +
    "<Cell N='LocPinX' V='0.75' F='Width*0.5'/><Cell N='LocPinY' V='0.375' F='Height*0.5'/>" +
    "<Text>Task One</Text>" +
    "</Shape>" +
    "<Shape ID='2' NameU='Task 2' Type='Shape' Master='2'>" +
    "<Cell N='PinX' V='5'/><Cell N='PinY' V='4'/>" +
    "<Cell N='Width' V='1.5'/><Cell N='Height' V='0.75'/>" +
    "<Cell N='LocPinX' V='0.75' F='Width*0.5'/><Cell N='LocPinY' V='0.375' F='Height*0.5'/>" +
    "<Text>Task Two</Text>" +
    "</Shape>" +
    "<Shape ID='3' NameU='Start' Type='Shape' Master='13'>" +
    "<Cell N='PinX' V='8'/><Cell N='PinY' V='4'/>" +
    "<Cell N='Width' V='0.375'/><Cell N='Height' V='0.375'/>" +
    "<Cell N='LocPinX' V='0.1875' F='Width*0.5'/><Cell N='LocPinY' V='0.1875' F='Height*0.5'/>" +
    "<Text>Start</Text>" +
    "</Shape>" +
    "</Shapes>" +
    "</PageContents>");

  // Doc props
  zip.file('docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>Multi Test</dc:title><dc:creator>Diagramatix</dc:creator>' +
    '</cp:coreProperties>');

  zip.file('docProps/app.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Diagramatix</Application></Properties>');

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  fs.writeFileSync('./test-multi.vsdx', out);
  console.log('Written test-multi.vsdx (' + out.length + ' bytes)');
}
generate().catch(console.error);
