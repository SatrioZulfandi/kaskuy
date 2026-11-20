function parseCsv(source) {
  const input = source.replace(/^\uFEFF/, '');
  const records = [];
  let index = 0;

  function readField() {
    if (input[index] === '"') {
      let value = '';
      index++;
      while (index < input.length) {
        const character = input[index++];
        if (character !== '"') {
          value += character;
        } else if (input[index] === '"') {
          value += '"';
          index++;
        } else {
          if (index < input.length && !/[\r\n,]/.test(input[index])) {
            throw new Error(`Karakter setelah tanda kutip di baris CSV ${records.length + 1}.`);
          }
          return value;
        }
      }
      throw new Error(`Tanda kutip CSV belum ditutup di baris ${records.length + 1}.`);
    }

    const start = index;
    while (index < input.length && !/[\r\n,]/.test(input[index])) {
      if (input[index] === '"') throw new Error(`Kutip tak terduga di baris CSV ${records.length + 1}.`);
      index++;
    }
    return input.slice(start, index);
  }

  function skipLineBreak() {
    if (input[index] === '\r') index++;
    if (input[index] === '\n') index++;
  }

  while (index < input.length) {
    if (input[index] === '\r' || input[index] === '\n') {
      skipLineBreak();
      continue;
    }
    const fields = [readField()];
    while (input[index] === ',') {
      index++;
      fields.push(readField());
    }
    records.push(fields);
    skipLineBreak();
  }

  const header = records.shift();
  if (!header) throw new Error('CSV kosong, tidak ada nama kolom.');
  const columns = header.map((cell) => cell.trim());
  if (columns.some((name) => !name) || columns.length !== new Set(columns).size) {
    throw new Error('Nama kolom CSV kosong atau ganda.');
  }
  return records.map((fields, index) => {
    if (fields.length !== columns.length) {
      throw new Error(`Baris CSV ${index + 2} memiliki ${fields.length} sel, seharusnya ${columns.length}.`);
    }
    return Object.fromEntries(columns.map((column, i) => [column, fields[i]]));
  });
}

function writeCsv(headers, rows) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [headers.map(quote).join(',')];
  for (const row of rows) lines.push(headers.map((header) => quote(row[header])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { parseCsv, writeCsv };
