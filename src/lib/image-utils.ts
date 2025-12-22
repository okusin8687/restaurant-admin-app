/**
 * 画像を指定した最大幅/高さにリサイズし、Base64文字列で返す
 */
export const resizeImage = (file: File, maxWidth: number = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // アスペクト比を維持しながらリサイズ
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false }); // アルファチャンネル無効で高速化
        // 画像の描画品質を「低」に設定（リサイズ処理自体の高速化）
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'low'; 
          ctx.drawImage(img, 0, 0, width, height);
        }

        // クオリティを0.7(70%)に抑えてさらに軽量化
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        // "data:image/jpeg;base64,..." の接頭辞を削除して純粋なBase64のみ返す
        resolve(dataUrl.split(',')[1]);
      };
    };
    reader.onerror = (error) => reject(error);
  });
};