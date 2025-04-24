module.exports = {
  // ...existing code...
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
            plugins: [
              "@babel/plugin-proposal-class-properties",
              "@babel/plugin-transform-spread",
              "@babel/plugin-proposal-object-rest-spread",
            ],
          },
        },
      },
      // ...existing code...
    ],
  },
  // ...existing code...
};
