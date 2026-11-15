"""Generate small original reading samples; needs Python and Pillow."""
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from PIL import Image, ImageDraw, ImageFont

base=Path(__file__).resolve().parents[1]/'app'/'art'
chapters=[
 ("The last lamp","At the last house in the valley, a brass lamp was still burning. Mara took it off the sill and set it beside the map. In daylight the old route was just a dotted line. Seen through the lamp's glass, every dot seemed to move."),
 ("A path through the fog","By morning, the ridge had vanished behind a wall of cloud. Mara followed a chain of wet stones until she found the first cairn. Someone had tucked a paper bird into a crack. It pointed uphill."),
 ("Signal on the ridge","On the summit, Mara set the lamp on a flat rock. Across the valley, another light blinked twice. The route was open again. She wrote three words in her notebook: bring someone next.")
]
def xhtml(title,body):
 return '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>'+escape(title)+'</title></head><body>'+body+'</body></html>'
def jpg(i):
 im=Image.new('RGB',(620,835),['#201b2c','#192934','#283346'][i]);d=ImageDraw.Draw(im)
 cream='#fff1d8'; warm=['#f4af76','#d38b73','#f2cc90'][i]
 try:
  serif=ImageFont.truetype('DejaVuSerif.ttf',46); small=ImageFont.truetype('DejaVuSans.ttf',16)
 except OSError:
  serif=ImageFont.load_default(42);small=ImageFont.load_default(16)
 for j in range(2):
  y=113+329*j;d.rounded_rectangle((38,y,582,y+306),radius=15,fill=['#9a665f','#625578','#856c71'][(i+j)%3])
  d.ellipse((431-j*174,y+28,497-j*174,y+94),fill=warm)
  d.polygon([(40,y+230),(175,y+80),(230,y+155),(374,y+46),(580,y+230),(580,y+303),(40,y+303)],fill='#3d3e57')
  d.polygon([(40,y+252),(189,y+145),(259,y+210),(390,y+118),(580,y+240),(580,y+303),(40,y+303)],fill='#252b41')
  d.line([(113,y+260),(229,y+232),(330,y+251),(434,y+206)],fill=warm,width=4)
  d.rounded_rectangle((55,y+247,396,y+288),radius=7,fill=cream)
  d.text((67,y+256),[('The signal should be here.','Wait. That is not a star.'),('Two flashes. Then silence.','We follow the light.'),('The ridge is clear.','Someone was waiting.')] [i][j],fill='#211c26',font=small)
 d.text((36,32),'Signal at dusk',fill=cream,font=serif)
 d.text((38,780),'A PDF FORGE ORIGINAL   /   '+str(i+1)+' OF 3',fill=cream,font=small)
 b=BytesIO();im.save(b,'JPEG',quality=73,optimize=True);return b.getvalue()
pages=[jpg(i) for i in range(3)]
with ZipFile(base/'signal-at-dusk.cbz','w',ZIP_DEFLATED) as z:
 for no,im in zip([1,2,10],pages):z.writestr(f'Pages/page-{no}.jpg',im)
with ZipFile(base/'lantern-ridge.epub','w',ZIP_DEFLATED) as z:
 z.writestr('mimetype','application/epub+zip',compress_type=ZIP_STORED)
 z.writestr('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Book/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
 manifest=''.join(f'<item id="ch{i}" href="text/ch{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1,4))
 spine=''.join(f'<itemref idref="ch{i}"/>' for i in range(1,4))
 nav=''.join(f'<li><a href="text/ch{i}.xhtml">{escape(t)}</a></li>' for i,(t,_) in enumerate(chapters,1))
 z.writestr('Book/book.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:c61da915-4830-464d-896b-f8cbfa8e886c</dc:identifier><dc:title>The Lantern Ridge</dc:title><dc:creator>PDF Forge</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-11-15T00:00:00Z</meta></metadata><manifest><item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ridge" href="art/ridge.jpg" media-type="image/jpeg"/>'+manifest+'</manifest><spine>'+spine+'</spine></package>')
 z.writestr('Book/toc.xhtml',xhtml('Contents','<nav epub:type="toc"><h1>Contents</h1><ol>'+nav+'</ol></nav>'))
 z.writestr('Book/art/ridge.jpg',pages[0])
 for i,(t,body) in enumerate(chapters,1):
  z.writestr(f'Book/text/ch{i}.xhtml',xhtml(t,'<h1>'+escape(t)+'</h1><p>'+escape(body)+'</p>'+('<figure><img src="../art/ridge.jpg" alt="A stylised illustrated mountain ridge"/></figure><p><a href="ch2.xhtml">Continue to the next chapter</a></p>' if i==1 else '')))
