declare module 'nodeconfigloder' {
  export default class ConfigLoder {
    constructor(debug?: boolean);
    readConfigSync(filepath: string): string;
  }
}
