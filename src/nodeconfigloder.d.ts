declare module 'nodeconfigloder' {
  /**
   * 処理名: 設定ローダー
   *
   * 処理概要: JSON/YAML 設定ファイルを同期的に読み込むラッパクラス
   *
   * 実装理由: nodeconfigloder モジュールの型定義を提供するため
   */
  export default class ConfigLoder {
    /**
     * @param debug デバッグモードフラグ
     */
    constructor(debug?: boolean);
    /**
     * 設定ファイルを同期読み込みする
     * @param filepath 読み込むファイルパス
     * @returns ファイル内容文字列
     */
    readConfigSync(filepath: string): string;
  }
}
