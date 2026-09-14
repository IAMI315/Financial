import type { Transaction } from '../types';

type MonthlyTransactionTablesProps = {
  items: Transaction[];
  readOnly?: boolean;
  onEdit?: (item: Transaction) => void;
  onDelete?: (item: Transaction) => void;
};

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${year}年${Number(monthNumber)}月`;
}

function dayLabel(day: string): string {
  const [, monthNumber, dayNumber] = day.split('-');
  return `${Number(monthNumber)}月${Number(dayNumber)}日`;
}

function groupByDay(items: Transaction[]): Array<[string, Transaction[]]> {
  const days = new Map<string, Transaction[]>();
  for (const item of items) {
    const day = item.occurredAtLocal.slice(0, 10);
    const bucket = days.get(day) ?? [];
    bucket.push(item);
    days.set(day, bucket);
  }
  return [...days.entries()];
}

export function MonthlyTransactionTables({
  items,
  readOnly = false,
  onEdit,
  onDelete,
}: MonthlyTransactionTablesProps) {
  const groups = new Map<string, Transaction[]>();
  for (const item of [...items].sort((a, b) => b.occurredAt - a.occurredAt)) {
    const month = item.occurredAtLocal.slice(0, 7);
    const bucket = groups.get(month) ?? [];
    bucket.push(item);
    groups.set(month, bucket);
  }

  if (items.length === 0) return <p className="empty">没有符合条件的交易。</p>;

  return (
    <div className="monthly-ledgers">
      {[...groups.entries()].map(([month, monthItems]) => (
        <section className="month-ledger" key={month}>
          <div className="month-ledger-title">
            <div>
              <span className="eyebrow">月度流水</span>
              <h3>{monthLabel(month)}</h3>
            </div>
            <span>{monthItems.length} 笔</span>
          </div>
          <div className="day-ledgers">
            {groupByDay(monthItems).map(([day, dayItems]) => (
              <section className="day-ledger" key={day}>
                <div className="day-ledger-title">
                  <strong>{dayLabel(day)}</strong>
                  <span>{dayItems.length} 笔</span>
                </div>
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>类型</th>
                        <th>类别</th>
                        <th>备注</th>
                        <th className="amount-cell">金额</th>
                        {!readOnly && <th className="actions-cell">操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {dayItems.map((item) => (
                        <tr key={item.id}>
                          <td className="time-cell">{item.occurredAtLocal.slice(11)}</td>
                          <td><span className={`type-pill ${item.type}`}>{item.type === 'expense' ? '支出' : '收入'}</span></td>
                          <td>
                            <strong>{item.categoryName}</strong>
                            {item.subcategoryName && <span className="subcategory-text"> / {item.subcategoryName}</span>}
                          </td>
                          <td className="note-cell">{item.note || '—'}</td>
                          <td className={`amount-cell transaction-amount ${item.type}`}>
                            {item.type === 'expense' ? '-' : '+'}¥{item.amount}
                          </td>
                          {!readOnly && (
                            <td className="actions-cell">
                              <div className="row-actions table-actions">
                                {onEdit && <button className="text-button" onClick={() => onEdit(item)}>编辑</button>}
                                {onDelete && <button className="text-button danger" onClick={() => onDelete(item)}>删除</button>}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
