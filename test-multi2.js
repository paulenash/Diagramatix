const fs = require('fs');
const JSZip = require('./diagramatix/node_modules/jszip');

async function generate() {
  const buf = fs.readFileSync('./BPMN Diagram Shapes v4.6.vssx');
  const stencil = await JSZip.loadAsync(buf);
  const mastersXml = await stencil.file('visio/masters/masters.xml').async('string');
  const relsXml = await stencil.file('visio/masters/_rels/masters.xml.rels').async('string');

  // Parse rels
  const rIdToFile = new Map();
  const relRe = /Relationship\s+Id=["'](rId\d+)["'][^>]*Target=["']([^"']*)["']/g;
  let m;
  while ((m = relRe.exec(relsXml)) !== null) rIdToFile.set(m[1], m[2]);

  // Parse masters
  const allMasters = new Map();
  const masterRe = /<Master\s+ID='(\d+)'[^>]*>[\s\S]*?<\/Master>/g;
  while ((m = masterRe.exec(mastersXml)) !== null) {
    const id = parseInt(m[1], 10);
    const relMatch = m[0].match(/<Rel\s+r:id='(rId\d+)'/);
    if (!relMatch) continue;
    const rId = relMatch[1];
    const filename = rIdToFile.get(rId);
    if (!filename) continue;
    allMasters.set(id, { id, rId, filename, masterXml: m[0] });
  }

  // Only need Task (2) - same master as the working single-shape test
  const needed = [allMasters.get(2)];
  const zip = new JSZip();

  // Content types - ONLY Task master
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>' +
    '<Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>' +
    '<Override PartName="/visio/masters/' + needed[0].filename + '" ContentType="application/vnd.ms-visio.master+xml"/>' +
    '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>' +
    '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>' +
    '<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>' +
    '<Override PartName="/visio/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>');

  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>');

  zip.file('visio/document.xml', await stencil.file('visio/document.xml').async('string'));
  zip.file('visio/theme/theme1.xml', await stencil.file('visio/theme/theme1.xml').async('string'));
  zip.file('visio/windows.xml', await stencil.file('visio/windows.xml').async('string'));

  zip.file('visio/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
    '</Relationships>');

  // Single master
  const masterBlock = needed[0].masterXml.replace(/<Rel\s+r:id='rId\d+'/, "<Rel r:id='rId1'");
  zip.file('visio/masters/masters.xml',
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<Masters xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    masterBlock +
    '</Masters>');

  zip.file('visio/masters/_rels/masters.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="' + needed[0].filename + '"/>' +
    '</Relationships>');

  zip.file('visio/masters/' + needed[0].filename, await stencil.file('visio/masters/' + needed[0].filename).async('string'));

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

  zip.file('visio/pages/_rels/pages.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>' +
    '</Relationships>');

  // THREE Task shapes — each is a separate top-level Group shape referencing the master
  // Shape IDs must not overlap — each group reserves IDs for its sub-shapes
  zip.file('visio/pages/page1.xml',
    "<?xml version='1.0' encoding='utf-8' ?>" +
    "<PageContents xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>" +
    "<Shapes>" +
    "<Shape ID='100' NameU='Task 1' Type='Group' Master='2'><Cell N='PinX' V='2'/><Cell N='PinY' V='4.25'/><Cell N='Width' V='1.5'/><Cell N='Height' V='0.75'/><Cell N='LocPinX' V='0.75' F='Width*0.5'/><Cell N='LocPinY' V='0.375' F='Height*0.5'/><Text>Task One</Text></Shape>" +
    "<Shape ID='200' NameU='Task 2' Type='Group' Master='2'><Cell N='PinX' V='5.5'/><Cell N='PinY' V='4.25'/><Cell N='Width' V='1.5'/><Cell N='Height' V='0.75'/><Cell N='LocPinX' V='0.75' F='Width*0.5'/><Cell N='LocPinY' V='0.375' F='Height*0.5'/><Text>Task Two</Text></Shape>" +
    "<Shape ID='300' NameU='Task 3' Type='Group' Master='2'><Cell N='PinX' V='9'/><Cell N='PinY' V='4.25'/><Cell N='Width' V='1.5'/><Cell N='Height' V='0.75'/><Cell N='LocPinX' V='0.75' F='Width*0.5'/><Cell N='LocPinY' V='0.375' F='Height*0.5'/><Text>Task Three</Text></Shape>" +
    "</Shapes>" +
    "</PageContents>");

  zip.file('docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>Multi Test 2</dc:title><dc:creator>Diagramatix</dc:creator></cp:coreProperties>');

  zip.file('docProps/app.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Diagramatix</Application></Properties>');

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  fs.writeFileSync('./test-multi2.vsdx', out);
  console.log('Written test-multi2.vsdx (' + out.length + ' bytes)');
}
generate().catch(console.error);
