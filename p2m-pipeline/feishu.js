const fetch = require('node-fetch');

const BASE_URL = 'https://open.feishu.cn/open-apis';

async function getAccessToken(appId, appSecret) {
  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu auth failed: ${data.msg}`);
  return data.tenant_access_token;
}

async function queryRecords(token, appToken, tableId) {
  const allRecords = [];
  let pageToken = '';

  do {
    const body = {
      filter: {
        conditions: [
          { field_name: '是否生成视频', operator: 'is', value: ['是'] },
        ],
        conjunction: 'and',
      },
      page_size: 100,
    };
    if (pageToken) body.page_token = pageToken;

    const res = await fetch(
      `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (data.code !== 0) throw new Error(`Feishu query failed: ${data.msg}`);

    allRecords.push(...(data.data.items || []));
    pageToken = data.data.has_more ? data.data.page_token : '';
  } while (pageToken);

  return allRecords;
}

async function updateRecord(token, appToken, tableId, recordId, fields) {
  const res = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu update failed: ${data.msg}`);
  return data;
}

module.exports = { getAccessToken, queryRecords, updateRecord };
