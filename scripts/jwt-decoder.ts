#!/usr/bin/env ts-node
import { decodeJwt, decodeProtectedHeader } from 'jose';

function decodeToken(token: string) {
  try {
    // ヘッダーのデコード
    const header = decodeProtectedHeader(token);
    console.log('\n=== JWT Header ===');
    console.log(JSON.stringify(header, null, 2));

    // ペイロードのデコード
    const payload = decodeJwt(token);
    console.log('\n=== JWT Payload ===');
    console.log(JSON.stringify(payload, null, 2));

    // 有効期限の確認
    if (payload.exp) {
      const expiryDate = new Date(payload.exp * 1000);
      console.log('\n=== Token Expiry ===');
      console.log(`Expires at: ${expiryDate.toISOString()}`);
      console.log(`Is expired: ${expiryDate < new Date()}`);
    }

    // トークンの構造確認
    const parts = token.split('.');
    console.log('\n=== Token Structure ===');
    console.log(`Parts: ${parts.length}`);
    console.log(`Header length: ${parts[0]?.length || 0}`);
    console.log(`Payload length: ${parts[1]?.length || 0}`);
    console.log(`Signature length: ${parts[2]?.length || 0}`);

  } catch (error) {
    console.error('Error decoding JWT:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

// コマンドライン引数からトークンを取得
const token = process.argv[2];
if (!token) {
  console.error('Usage: npm run script:jwt-decoder <JWT_TOKEN>');
  process.exit(1);
}

decodeToken(token);