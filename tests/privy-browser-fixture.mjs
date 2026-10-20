// Test-only interception: production modules have no authentication bypass.
export async function installPrivyFixture(page, { address }) {
  await page.route('**/src/auth/AccountProvider.tsx', async route => {
    const response = await route.fetch()
    const source = await response.text()
    if (!/const appId = [^;]+;/.test(source)) throw new Error('Auth-provider fixture no longer matches the source.')
    await route.fulfill({ response, body: source.replace(/const appId = [^;]+;/, 'const appId = "test-only-app";') })
  })
  // Run the installed adapter source so it imports the intercepted SDK module.
  // The real adapter's connector synchronization is exercised, not mocked.
  await page.route(/\/node_modules\/\.vite\/deps\/@privy-io_wagmi\.js/, route => route.fulfill({ contentType: 'text/javascript', body:
    "export * from '/node_modules/@privy-io/wagmi/dist/esm/index.mjs';" }))
  await page.route(/\/node_modules\/\.vite\/deps\/@privy-io_react-auth\.js/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    const Context = React.createContext(null);
    const firstAddress = '${address}';
    function makeWallet(address) {
      const provider = {
        on: (...args) => window.ethereum.on(...args), removeListener: (...args) => window.ethereum.removeListener(...args),
        request: async (params) => ['eth_accounts','eth_requestAccounts'].includes(params.method) ? [address] : window.ethereum.request(params),
      };
      return { address, chainId: 'eip155:5042', walletClientType: 'metamask', connectorType: 'injected',
        meta: { id: 'fixture.' + address, name: 'Browser Wallet' }, getEthereumProvider: () => Promise.resolve(provider) };
    }
    export function PrivyProvider({children, config}) {
      const [subject, setSubject] = React.useState(null);
      const [wallets, setWallets] = React.useState([]);
      const [modal, setModal] = React.useState(false);
      const callbacks = React.useRef(new Set());
      React.useEffect(() => {
        window.fixtureAuthSwitch = value => { setSubject(value); setWallets([]); };
        window.fixtureWallets = addresses => setWallets(addresses.map(makeWallet));
      }, []);
      const loginAs = method => { setSubject('did:privy:alice'); setWallets(method === 'wallet' || config.embeddedWallets?.ethereum?.createOnLogin === 'users-without-wallets' ? [makeWallet(firstAddress)] : []); setModal(false); };
      const createWallet = async () => { const wallet = makeWallet(firstAddress); setWallets(current => current.some(item => item.address === wallet.address) ? current : [...current, wallet]); return wallet; };
      const connectWallet = () => {
        const wallet = makeWallet(firstAddress);
        setWallets(current => current.some(item => item.address === wallet.address) ? current : [...current, wallet]);
        for (const listener of callbacks.current) listener?.onSuccess?.({wallet});
      };
      const user = React.useMemo(() => subject ? { id: subject, wallet: wallets[0] ? {address: wallets[0].address} : undefined, linkedAccounts: [] } : null, [subject, wallets]);
      const value = { ready: true, authenticated: !!subject, user, wallets, callbacks,
        login: () => setModal(true), connectWallet, createWallet,
        logout: () => { setSubject(null); setWallets([]); return Promise.resolve(); },
        getAccessToken: () => { if (window.pauseNextToken) { window.pauseNextToken = false; return new Promise(resolve => { window.resolveFixtureToken = resolve; }); } return Promise.resolve(subject); } };
      return React.createElement(Context.Provider, {value}, children, modal && React.createElement('div', {role:'dialog','aria-label':'Privy sign in'},
        React.createElement('button', {onClick:()=>loginAs('email')}, 'Continue with email'),
        React.createElement('button', {onClick:()=>loginAs('google')}, 'Continue with Google'),
        React.createElement('button', {onClick:()=>loginAs('wallet')}, 'Continue with wallet'),
        React.createElement('button', {onClick:()=>setModal(false)}, 'Cancel sign in')));
    }
    export function usePrivy() { return React.useContext(Context); }
    export function useCreateWallet() { return { createWallet: usePrivy().createWallet }; }
    export function useWallets() { const session = usePrivy(); return {ready:true, wallets:session.wallets}; }
    export function useConnectWallet(callbacks) {
      const session = usePrivy();
      React.useEffect(() => { session.callbacks.current.add(callbacks); return () => session.callbacks.current.delete(callbacks); }, [callbacks, session.callbacks]);
      return {connectWallet:session.connectWallet};
    }
    export function useConnectOrCreateWallet(callbacks) { const {connectWallet} = useConnectWallet(callbacks); return {connectOrCreateWallet:connectWallet}; }
    export function useLogin() { return {login:usePrivy().login}; }
  ` }))
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ profile: null, wallets: [] }) }))
}
