import JSZip from 'jszip';
import { expect } from 'vitest';

export const OPF_NS = 'http://www.idpf.org/2007/opf';

/**
 * Kiểm cấu trúc EPUB theo những gì Calibre đòi hỏi (lỗi "Spineless: Book is empty, no content in spine"):
 * mimetype đứng đầu, namespace OPF 2007, spine không rỗng, mọi idref/href đều có thật.
 */
export async function expectValidEpub(data: Blob | Uint8Array | ArrayBuffer): Promise<JSZip> {
  const raw = data instanceof Blob ? await data.arrayBuffer() : data;
  const zip = await JSZip.loadAsync(raw);
  expect(Object.keys(zip.files)[0]).toBe('mimetype');

  const container = new DOMParser().parseFromString(await zip.file('META-INF/container.xml')!.async('string'), 'application/xml');
  const opfPath = container.getElementsByTagName('rootfile')[0].getAttribute('full-path')!;
  const opf = new DOMParser().parseFromString(await zip.file(opfPath)!.async('string'), 'application/xml');
  expect(opf.documentElement.namespaceURI).toBe(OPF_NS);

  const manifest = new Map([...opf.getElementsByTagName('item')].map((i) => [i.getAttribute('id'), i.getAttribute('href')!]));
  const idrefs = [...opf.getElementsByTagName('itemref')].map((r) => r.getAttribute('idref'));
  expect(idrefs.length).toBeGreaterThan(0);
  for (const id of idrefs) expect(manifest.has(id)).toBe(true);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  for (const href of manifest.values()) expect(zip.file(base + decodeURIComponent(href))).not.toBeNull();
  return zip;
}
