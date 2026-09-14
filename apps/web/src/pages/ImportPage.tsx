import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Category, TransactionType } from '../types';

type AnalyzeRow = {
  sourceRow: number;
  valid: boolean;
  duplicate: boolean;
  errors: string[];
  normalized: null | {
    type: TransactionType;
    amountFen: number;
    categoryId: number;
    subcategoryId?: number | null;
    occurredAt: number;
    note?: string | null;
  };
};

type Analysis = {
  rows: AnalyzeRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number };
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { values.push(current); current = ''; }
    else current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function headersAndValues(csv: string): { headers: string[]; values: Record<string, string[]> } {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(0, 500);
  if (!lines[0]) return { headers: [], values: {} };
  const headers = parseCsvLine(lines[0]);
  const values: Record<string, Set<string>> = Object.fromEntries(headers.map((header) => [header, new Set<string>()]));
  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    headers.forEach((header, index) => { const value = columns[index]?.trim(); if (value) values[header]?.add(value); });
  }
  return { headers, values: Object.fromEntries(Object.entries(values).map(([key, set]) => [key, [...set].slice(0, 50)])) };
}

export function ImportPage() {
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [timeColumn, setTimeColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [typeMode, setTypeMode] = useState<'fixed-expense' | 'fixed-income' | 'column' | 'sign'>('fixed-expense');
  const [typeColumn, setTypeColumn] = useState('');
  const [typeMap, setTypeMap] = useState<Record<string, TransactionType>>({});
  const [positiveMeans, setPositiveMeans] = useState<TransactionType>('income');
  const [categoryMode, setCategoryMode] = useState<'fixed' | 'column'>('fixed');
  const [fixedCategoryId, setFixedCategoryId] = useState<number | ''>('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [categoryMap, setCategoryMap] = useState<Record<string, number>>({});
  const [subcategoryColumn, setSubcategoryColumn] = useState('');
  const [subcategoryMap, setSubcategoryMap] = useState<Record<string, number>>({});
  const [noteColumn, setNoteColumn] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [batchId, setBatchId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const sample = useMemo(() => headersAndValues(csv), [csv]);

  async function loadCategories() { setCategories((await api<{ categories: Category[] }>('/api/categories?includeArchived=false')).categories); }
  useEffect(() => { void loadCategories(); }, []);

  async function chooseFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    const parsed = headersAndValues(text);
    setFileName(file.name); setCsv(text); setAnalysis(null); setBatchId(null); setIncluded({});
    setTimeColumn(parsed.headers.find((header) => /time|date|时间|日期/i.test(header)) ?? parsed.headers[0] ?? '');
    setAmountColumn(parsed.headers.find((header) => /amount|金额|money/i.test(header)) ?? parsed.headers[1] ?? '');
  }

  async function createMappingCategory(external: string, suggestedType?: TransactionType) {
    let type = suggestedType;
    if (!type) {
      const answer = window.prompt('该新分类属于哪种类型？请输入 income（收入）或 expense（支出）', 'expense');
      if (answer === null) return;
      if (answer !== 'income' && answer !== 'expense') {
        setMessage('分类类型必须输入 income 或 expense。');
        return;
      }
      type = answer;
    }
    const name = window.prompt(`为外部分类“${external}”创建新的${type === 'expense' ? '支出' : '收入'}一级分类`, external)?.trim();
    if (!name) return;
    const result = await api<{ category: Category }>('/api/categories', { method: 'POST', body: { type, name } });
    await loadCategories();
    setCategoryMap((current) => ({ ...current, [external]: result.category.id }));
  }

  async function analyze() {
    setMessage(''); setBatchId(null);
    if (!csv || !timeColumn || !amountColumn) return setMessage('请先选择 CSV，并映射时间和金额列。');
    try {
      const mapping: Record<string, unknown> = { timeColumn, amountColumn, positiveMeans };
      if (noteColumn) mapping.noteColumn = noteColumn;
      if (typeMode === 'fixed-expense') mapping.fixedType = 'expense';
      if (typeMode === 'fixed-income') mapping.fixedType = 'income';
      if (typeMode === 'column') { mapping.typeColumn = typeColumn; mapping.typeMap = typeMap; }
      if (categoryMode === 'fixed') mapping.fixedCategoryId = fixedCategoryId;
      else { mapping.categoryColumn = categoryColumn; mapping.categoryMap = categoryMap; }
      if (subcategoryColumn) {
        mapping.subcategoryColumn = subcategoryColumn;
        mapping.subcategoryMap = subcategoryMap;
      }
      const result = await api<Analysis>('/api/imports/analyze', { method: 'POST', body: { sourceName: fileName || null, csv, mapping } });
      setAnalysis(result);
      setIncluded(Object.fromEntries(result.rows.map((row) => [row.sourceRow, row.valid && !row.duplicate])));
    } catch (error) { setMessage(error instanceof Error ? error.message : '分析失败'); }
  }

  async function commit() {
    if (!analysis) return;
    const rows = analysis.rows.filter((row) => row.valid && row.normalized).map((row) => ({ ...row.normalized!, include: included[row.sourceRow] ?? false }));
    try {
      const result = await api<{ batchId: number; count: number }>('/api/imports/commit', { method: 'POST', body: { sourceName: fileName || null, rows } });
      setBatchId(result.batchId); setMessage(`已成功导入 ${result.count} 笔交易。离开此页面后将不再提供整批撤销入口。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败'); }
  }

  async function rollback() {
    if (!batchId || !window.confirm('确认永久删除本次导入创建的全部交易？即使你刚刚修改过其中某笔，也会一起删除。')) return;
    await api(`/api/imports/${batchId}`, { method: 'DELETE' });
    setBatchId(null); setAnalysis(null); setMessage('本次导入已整批撤销，导入过程中创建的分类仍然保留。');
  }

  const rootCategories = categories.filter((item) => item.parentId === null && !item.isArchived);
  const categoryExternalValues = categoryColumn ? sample.values[categoryColumn] ?? [] : [];
  const typeExternalValues = typeColumn ? sample.values[typeColumn] ?? [] : [];
  const subcategoryExternalValues = subcategoryColumn ? sample.values[subcategoryColumn] ?? [] : [];
  const childCategories = categories.filter((item) => item.parentId !== null && !item.isArchived);

  return <div className="page-stack">
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">CSV 导入</span><h2>1. 选择文件与字段映射</h2></div></div><label className="file-drop"><input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /><strong>{fileName || '选择 CSV 文件'}</strong><span>文件只在当前浏览器读取并发送到你的自建服务器分析。</span></label>{sample.headers.length > 0 && <div className="mapping-grid"><label>交易时间列<select value={timeColumn} onChange={(event) => setTimeColumn(event.target.value)}>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label><label>金额列<select value={amountColumn} onChange={(event) => setAmountColumn(event.target.value)}>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label><label>交易类型来源<select value={typeMode} onChange={(event) => setTypeMode(event.target.value as typeof typeMode)}><option value="fixed-expense">整批设为支出</option><option value="fixed-income">整批设为收入</option><option value="column">来自 CSV 类型列</option><option value="sign">由金额正负号判断</option></select></label>{typeMode === 'column' && <label>类型列<select value={typeColumn} onChange={(event) => setTypeColumn(event.target.value)}><option value="">请选择</option>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label>}{typeMode === 'sign' && <label>正数代表<select value={positiveMeans} onChange={(event) => setPositiveMeans(event.target.value as TransactionType)}><option value="income">收入（负数=支出）</option><option value="expense">支出（负数=收入）</option></select></label>}<label>分类来源<select value={categoryMode} onChange={(event) => setCategoryMode(event.target.value as typeof categoryMode)}><option value="fixed">整批指定分类</option><option value="column">来自 CSV 分类列</option></select></label>{categoryMode === 'fixed' ? <label>统一分类<select value={fixedCategoryId} onChange={(event) => setFixedCategoryId(event.target.value ? Number(event.target.value) : '')}><option value="">请选择</option>{rootCategories.map((category) => <option value={category.id} key={category.id}>{category.type === 'expense' ? '支出' : '收入'} · {category.name}</option>)}</select></label> : <label>分类列<select value={categoryColumn} onChange={(event) => setCategoryColumn(event.target.value)}><option value="">请选择</option>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label>}<label>二级分类列（可选）<select value={subcategoryColumn} onChange={(event) => setSubcategoryColumn(event.target.value)}><option value="">不导入二级分类</option>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label><label>备注列（可选）<select value={noteColumn} onChange={(event) => setNoteColumn(event.target.value)}><option value="">不导入备注</option>{sample.headers.map((header) => <option key={header}>{header}</option>)}</select></label></div>}</section>

    {typeMode === 'column' && typeColumn && <section className="panel"><div className="panel-title"><div><span className="eyebrow">类型映射</span><h2>2. 映射外部类型</h2></div></div><div className="mapping-list">{typeExternalValues.map((external) => <label key={external}><span>{external}</span><select value={typeMap[external] ?? ''} onChange={(event) => setTypeMap((current) => ({ ...current, [external]: event.target.value as TransactionType }))}><option value="">请选择</option><option value="expense">支出</option><option value="income">收入</option></select></label>)}</div></section>}
    {categoryMode === 'column' && categoryColumn && <section className="panel"><div className="panel-title"><div><span className="eyebrow">分类映射</span><h2>3. 映射外部分类</h2></div></div><div className="mapping-list">{categoryExternalValues.map((external) => <div className="mapping-row" key={external}><span>{external}</span><select value={categoryMap[external] ?? ''} onChange={(event) => setCategoryMap((current) => ({ ...current, [external]: Number(event.target.value) }))}><option value="">尚未映射</option>{rootCategories.map((category) => <option value={category.id} key={category.id}>{category.type === 'expense' ? '支出' : '收入'} · {category.name}</option>)}</select><button className="text-button" onClick={() => void createMappingCategory(external, typeMode === 'fixed-income' ? 'income' : typeMode === 'fixed-expense' ? 'expense' : undefined)}>新建分类</button></div>)}</div></section>}

    {subcategoryColumn && <section className="panel"><div className="panel-title"><div><span className="eyebrow">二级分类映射</span><h2>4. 映射外部二级分类</h2></div></div><div className="mapping-list">{subcategoryExternalValues.map((external) => <div className="mapping-row" key={external}><span>{external}</span><select value={subcategoryMap[external] ?? ''} onChange={(event) => setSubcategoryMap((current) => ({ ...current, [external]: Number(event.target.value) }))}><option value="">不映射</option>{childCategories.map((category) => { const parent = categories.find((item) => item.id === category.parentId); return <option value={category.id} key={category.id}>{category.type === 'expense' ? '支出' : '收入'} · {parent?.name ?? '未命名'} → {category.name}</option>; })}</select></div>)}</div></section>}

    {csv && <section className="panel"><button className="primary" onClick={() => void analyze()}>分析并预览</button>{message && <div className="notice">{message}</div>}</section>}
    {analysis && <section className="panel"><div className="panel-title"><div><span className="eyebrow">导入预览</span><h2>{analysis.summary.total} 行</h2></div><div className="summary-pills"><span>可解析 {analysis.summary.valid}</span><span className="warning">异常 {analysis.summary.invalid}</span><span>疑似重复 {analysis.summary.duplicates}</span></div></div><div className="preview-table"><div className="preview-head"><span>导入</span><span>行</span><span>状态</span><span>说明</span></div>{analysis.rows.slice(0, 500).map((row) => <div className={`preview-row ${!row.valid ? 'invalid' : row.duplicate ? 'duplicate' : ''}`} key={row.sourceRow}><input type="checkbox" disabled={!row.valid} checked={included[row.sourceRow] ?? false} onChange={(event) => setIncluded((current) => ({ ...current, [row.sourceRow]: event.target.checked }))} /><span>{row.sourceRow}</span><span>{!row.valid ? '异常' : row.duplicate ? '疑似重复' : '正常'}</span><span>{row.errors.join('；') || (row.duplicate ? '默认不勾选；确认真实存在后可手动勾选' : '可导入')}</span></div>)}</div><button className="primary" disabled={batchId !== null} onClick={() => void commit()}>确认导入已勾选记录</button>{batchId && <button className="danger-button" onClick={() => void rollback()}>一键撤销本次导入</button>}</section>}
  </div>;
}
