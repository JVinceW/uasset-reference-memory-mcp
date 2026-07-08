declare module "sql.js" {
  export interface Statement {
    bind(params: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  export interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): unknown[];
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }
  export interface InitConfig {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(config?: InitConfig): Promise<SqlJsStatic>;
}
