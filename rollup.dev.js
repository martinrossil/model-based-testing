import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

export default defineConfig({
    input: [
        './src/ModelBasedTesting.ts',
    ],
    plugins: [
        resolve(),
        esbuild(),
        serve({
            contentBase: 'development',
            open: true,
            historyApiFallback: true,
            port: 10000,
        }),
        livereload(),
    ],
    output: {
        file: './development/dev.js',
        format: 'esm',
        sourcemap: 'inline',
    },
});
