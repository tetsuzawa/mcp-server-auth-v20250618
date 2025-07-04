#!/usr/bin/env ts-node
import { compactDecrypt, importJWK, decodeJwt, decodeProtectedHeader } from 'jose';

async function decodeJWE(token: string, privateKeyJWK?: string) {
  try {
    const parts = token.split('.');
    console.log('\n=== JWE Structure ===');
    console.log(`Parts: ${parts.length}`);
    
    if (parts.length !== 5) {
      throw new Error('Invalid JWE format. Expected 5 parts.');
    }

    // JWEヘッダーのデコード
    const jweHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    console.log('\n=== JWE Header ===');
    console.log(JSON.stringify(jweHeader, null, 2));

    if (privateKeyJWK) {
      console.log('\n=== Attempting JWE Decryption ===');
      
      try {
        // プライベートキーのインポート
        const privateKey = await importJWK(JSON.parse(privateKeyJWK), jweHeader.alg);
        
        // JWEの復号
        const { plaintext } = await compactDecrypt(token, privateKey);
        const decryptedJWT = new TextDecoder().decode(plaintext);
        
        console.log('\n=== Decrypted JWT ===');
        console.log(`JWT: ${decryptedJWT.substring(0, 50)}...`);
        
        // 復号されたJWTの解析
        const jwtHeader = decodeProtectedHeader(decryptedJWT);
        console.log('\n=== JWT Header ===');
        console.log(JSON.stringify(jwtHeader, null, 2));

        const jwtPayload = decodeJwt(decryptedJWT);
        console.log('\n=== JWT Payload ===');
        console.log(JSON.stringify(jwtPayload, null, 2));

        // 有効期限の確認
        if (jwtPayload.exp) {
          const expiryDate = new Date(jwtPayload.exp * 1000);
          console.log('\n=== Token Expiry ===');
          console.log(`Expires at: ${expiryDate.toISOString()}`);
          console.log(`Is expired: ${expiryDate < new Date()}`);
        }
      } catch (decryptError) {
        console.error('\nFailed to decrypt JWE:', decryptError);
      }
    } else {
      console.log('\n⚠️  No private key provided. Cannot decrypt JWE payload.');
      console.log('Usage: npm run script:jwe-decoder <JWE_TOKEN> <PRIVATE_KEY_JWK>');
    }

  } catch (error) {
    console.error('Error processing JWE:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

// コマンドライン引数からトークンとプライベートキーを取得
const token = process.argv[2];
const privateKeyJWK = process.argv[3];

if (!token) {
  console.error('Usage: npm run script:jwe-decoder <JWE_TOKEN> [PRIVATE_KEY_JWK]');
  console.error('\nExample:');
  console.error('npm run script:jwe-decoder "eyJ..." \'{"kty":"RSA","n":"...","e":"AQAB","d":"..."}\'');
  process.exit(1);
}

decodeJWE(token, privateKeyJWK);