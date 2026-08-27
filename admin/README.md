# React + TypeScript Template

A modern React template with TypeScript, Vite, TailwindCSS, and DaisyUI. Includes authentication flows and Docker support.

## Features

-   ⚡️ [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
-   🛠️ [Vite 6](https://vitejs.dev/) for fast development
-   🎨 [TailwindCSS 4](https://tailwindcss.com/) with [DaisyUI 5](https://daisyui.com/)
-   📱 Responsive authentication flows (Login, Register, Password Reset)
-   🐳 Docker support for development
-   ✨ ESLint configuration for code quality

## Quick Start

### Using Docker (Recommended)

1. Install [Docker](https://docs.docker.com/get-docker/)

2. Clone the repository:

```bash
git clone <repository-url>
cd REACT-Template
```

3. Build and run with Docker:

```bash
docker build -t react-template .
docker run -p 5173:5173 react-template
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

### Local Development

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open [http://localhost:5173](http://localhost:5173) in your browser

## Available Scripts

-   `npm run dev` - Start development server
-   `npm run build` - Build for production
-   `npm run preview` - Preview production build
-   `npm run lint` - Lint code with ESLint

## ESLint Configuration

For production applications, enable type-aware lint rules:

```js
// eslint.config.js
export default tseslint.config({
	extends: [
		...tseslint.configs.recommendedTypeChecked,
		...tseslint.configs.strictTypeChecked,
		...tseslint.configs.stylisticTypeChecked,
	],
	languageOptions: {
		parserOptions: {
			project: ['./tsconfig.node.json', './tsconfig.app.json'],
			tsconfigRootDir: import.meta.dirname,
		},
	},
});
```

## Docker Commands

Build the image:

```bash
docker build -t react-template .
```

Run the container:

```bash
docker run -p 5173:5173 react-template
```

Run with volume mount for development:

```bash
docker run -p 5173:5173 -v ${PWD}:/app react-template
```

## Development with Docker (Hot-Reloading)

### 1. Build the image:

```bash
docker build -t react-template .
```

### 2. Run with hot-reloading (choose your terminal):

For Windows CMD:

```bash
docker run -it --rm -p 5173:5173 -v "%cd%:/app" -v /app/node_modules --name react-dev react-template
```

For Git Bash:

```bash
docker run -it --rm -p 5173:5173 -v "/$PWD":/app -v /app/node_modules --name react-dev react-template
```

For PowerShell:

```powershell
docker run -it --rm -p 5173:5173 -v "${PWD}:/app" -v /app/node_modules --name react-dev react-template
```

> **Note**: Command explanation:
>
> -   `-it`: Interactive terminal
> -   `--rm`: Remove container when stopped
> -   `-p 5173:5173`: Port mapping
> -   `-v`: Volume mounts for hot-reloading
> -   `--name react-dev`: Name the container for easy reference

### 3. Stop the container:

```bash
docker stop react-dev
```

Now your local changes will be reflected immediately in the container.

## Development with Docker Compose (Recommended)

1. Start the development container:

```bash
docker compose up
```

2. Open [http://localhost:5173](http://localhost:5173) in your browser

3. The app will automatically reload when you make changes

4. To stop the container:

```bash
docker compose down
```

> **Note**: This method is preferred over the basic Docker commands as it:
>
> -   Simplifies the development setup
> -   Handles volume mounting automatically
> -   Enables hot-reloading out of the box
> -   Works consistently across different terminals and operating systems

## Project Structure

```
src/
  ├── components/      # Reusable components
  ├── layouts/         # Layout components
  ├── pages/          # Page components
  │   ├── auth/       # Authentication pages
  │   └── home/       # Home page
  ├── routes/         # Router configuration
  ├── types/          # TypeScript types
  └── assets/         # Static assets
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
