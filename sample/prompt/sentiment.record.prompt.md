---
output:
  columns:
    - name: sentiment
      path: sentiment
      required: true
    - name: reason
      path: reason
      required: true
---
レコード番号: {{NR}}
製品名: {{product}}
レビュアー: {{reviewer}}
スコア: {{score}} / 5
コメント: {{comment}}

上記のレビューの感情を分析し、以下のJSON形式で返してください。

```json
{
  "sentiment": "<positive|neutral|negative>",
  "reason": "<理由を1文で>"
}
```
