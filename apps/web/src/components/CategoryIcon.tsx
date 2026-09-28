import type { TransactionType } from '../types';

type IconSize = 'sm' | 'md' | 'lg';

const toneByCategory: Record<string, string> = {
  餐饮: 'orange',
  交通: 'blue',
  购物: 'pink',
  居住: 'purple',
  娱乐: 'violet',
  医疗: 'red',
  学习: 'green',
  通讯: 'cyan',
  生活缴费: 'blue',
  '人情/礼物': 'pink',
  经营: 'gold',
  工资: 'green',
  奖金: 'gold',
  兼职: 'violet',
  退款: 'cyan',
  '红包/礼金': 'red',
  补贴: 'blue',
  其他: 'slate',
};

function CategoryGlyph({ name }: { name: string }) {
  if (name === '餐饮') return <><path d="M7 4v8M4 4v6a3 3 0 0 0 6 0V4M7 12v16M20 4v24M20 4c6 3 7 10 0 15" /></>;
  if (name === '交通') return <><path d="M6 21h20l-2-8a4 4 0 0 0-4-3h-8a4 4 0 0 0-4 3zM9 21v3M23 21v3M9 17h14" /><circle cx="10" cy="22" r="1.5" /><circle cx="22" cy="22" r="1.5" /></>;
  if (name === '购物') return <><path d="M7 11h18l-1 16H8zM11 12V9a5 5 0 0 1 10 0v3" /></>;
  if (name === '居住') return <><path d="M4 15 16 5l12 10M8 13v14h16V13M13 27v-8h6v8" /></>;
  if (name === '娱乐') return <><path d="M9 12h14a6 6 0 0 1 5 9l-2 4a3 3 0 0 1-5 1l-2-3h-6l-2 3a3 3 0 0 1-5-1l-2-4a6 6 0 0 1 5-9zM10 16v6M7 19h6M22 17h.01M25 20h.01" /></>;
  if (name === '医疗') return <><path d="M8 9h16v18H8zM12 9V6h8v3M16 13v10M11 18h10" /></>;
  if (name === '学习') return <><path d="M5 7h9a5 5 0 0 1 5 5v15h-9a5 5 0 0 0-5 1zM27 7h-8a5 5 0 0 0-5 5v15h8a5 5 0 0 1 5 1z" /></>;
  if (name === '通讯') return <><path d="M10 5h12a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM13 8h6M15 24h2" /></>;
  if (name === '生活缴费') return <><path d="M8 5h16v22H8zM11 10h10M11 15h10M11 20h6" /></>;
  if (name === '人情/礼物' || name === '红包/礼金') return <><path d="M5 13h22v14H5zM4 10h24v5H4zM16 10v17M10 10c-3-1-3-5 0-5 4 0 6 5 6 5M22 10c3-1 3-5 0-5-4 0-6 5-6 5" /></>;
  if (name === '经营' || name === '奖金' || name === '补贴') return <><ellipse cx="16" cy="9" rx="9" ry="4" /><path d="M7 9v6c0 2 4 4 9 4s9-2 9-4V9M7 15v6c0 2 4 4 9 4s9-2 9-4v-6" /></>;
  if (name === '工资') return <><path d="M5 9h22v16H5zM9 9V6h14v3M10 17h12M16 13v8" /></>;
  return <><rect x="6" y="6" width="8" height="8" rx="2" /><rect x="18" y="6" width="8" height="8" rx="2" /><rect x="6" y="18" width="8" height="8" rx="2" /><rect x="18" y="18" width="8" height="8" rx="2" /></>;
}

export function CategoryIcon({
  categoryName,
  type,
  size = 'md',
}: {
  categoryName: string;
  type?: TransactionType;
  size?: IconSize;
}) {
  const tone = toneByCategory[categoryName] ?? (type === 'income' ? 'green' : 'slate');
  return (
    <span className={`category-icon ${size} tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 32 32"><CategoryGlyph name={categoryName} /></svg>
    </span>
  );
}
