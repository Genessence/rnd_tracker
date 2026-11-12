// Upload the MOM of an ended meeting (plain-text format in domain/mom-upload.ts). It becomes the draft MOM to review and publish.
import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { cx, SimulatedTag } from '../../design';
import { MOM_TEMPLATE, SAMPLE_MOM } from '../../domain/mom-upload';
import type { Meeting } from '../../domain/types';
import { uploadMom } from '../../sim/teams';
import { btn, btnPrimary } from './MeetingsPage';

const download = (name: string, text: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

export function UploadMom({ m }: { m: Meeting }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button type="button" onClick={() => fileRef.current?.click()} className={cx(btnPrimary, 'h-10 px-4 text-[13px]')}><FileUp size={14} /> Upload MOM file</button>
      <input ref={fileRef} type="file" accept=".txt,.md,text/plain" className="hidden" aria-label="MOM file"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setErrors(uploadMom(m.id, await f.text(), f.name)); e.target.value = ''; }} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={btn} onClick={() => setErrors(uploadMom(m.id, SAMPLE_MOM, 'MHI-2028-DV-review-MOM.txt'))}>Use sample MOM</button>
        <SimulatedTag label="Simulated upload" />
      </div>
      <div className="flex gap-3 text-[12px]">
        <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => download('MOM-template.txt', MOM_TEMPLATE)}><Download size={12} /> Template</button>
        <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => download('MOM-sample.txt', SAMPLE_MOM)}><Download size={12} /> Sample</button>
      </div>
      {errors.length > 0 && <p className="text-table text-late">{errors.join(' ')}</p>}
    </div>
  );
}
