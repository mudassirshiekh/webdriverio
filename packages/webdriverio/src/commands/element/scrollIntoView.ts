import logger from '@wdio/logger'
import { ELEMENT_KEY } from 'webdriver'

import { getBrowserObject } from '@wdio/utils'
import type { CustomScrollIntoViewOptions, MobileScrollIntoViewOptions } from '../../types.js'
import { MobileScrollDirection } from '../../types.js'

const log = logger('webdriverio')

/**
 *
 * Scroll element into viewport for Desktop/Mobile Web <strong>AND</strong> Mobile Native Apps.
 *
 * :::info
 *
 * Scrolling for Mobile Native Apps is done based on native mobile gestures. It is only supported for the following drivers:
 * - [appium-uiautomator2-driver](https://github.com/appium/appium-uiautomator2-driver/blob/master/docs/android-mobile-gestures.md#mobile-scrollgesture) for Android
 * - [appium-xcuitest-driver](https://appium.github.io/appium-xcuitest-driver/latest/reference/execute-methods/#mobile-scroll) for iOS
 *
 * :::
 *
 * <example>
    :desktop.mobile.web.scrollIntoView.js
    it('should demonstrate the desktop/mobile web scrollIntoView command', async () => {
        const elem = await $('#myElement');
        // scroll to specific element
        await elem.scrollIntoView();
        // center element within the viewport
        await elem.scrollIntoView({ block: 'center', inline: 'center' });
    });
 * </example>
 *
 * <example>
    :mobile.native.app.scrollIntoView.js
    it('should demonstrate the mobile native app scrollIntoView command', async () => {
        const elem = await $('#myElement');
        // scroll to a specific element in the default scrollable element for Android or iOS for a maximum of 10 scrolls
        await elem.scrollIntoView();
        // Scroll to the left in the scrollable element called '#scrollable' for a maximum of 5 scrolls
        await elem.scrollIntoView({ direction: 'left', maxScrolls: 5, scrollableElement: $('#scrollable') });
    });
 * </example>
 *
 * @alias element.scrollIntoView
 * @param {object|boolean=} options                   options for `Element.scrollIntoView()`. Default for desktop/mobile web: <br/> `{ block: 'start', inline: 'nearest' }` <br /> Default for Mobile Native App <br /> `{ maxScrolls: 10, scrollDirection: 'down' }`
 * @param {string=}         options.behavior          See [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView). <br /><strong>WEB-ONLY</strong> (Desktop/Mobile)
 * @param {string=}         options.block             See [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView). <br /><strong>WEB-ONLY</strong> (Desktop/Mobile)
 * @param {string=}         options.inline            See [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView). <br /><strong>WEB-ONLY</strong> (Desktop/Mobile)
 * @param {string=}         options.direction         Can be one of `down`, `up`, `left` or `right`, default is `down`. <br /><strong>MOBILE-NATIVE-APP-ONLY</strong>
 * @param {number=}         options.maxScrolls        The max amount of scrolls until it will stop searching for the element, default is `10`. <br /><strong>MOBILE-NATIVE-APP-ONLY</strong>
 * @param {Element=}        options.scrollableElement Element that is used to scroll within. If no element is provided it will use the following selector for iOS `-ios predicate string:type == "XCUIElementTypeApplication"` and the following for Android `//android.widget.ScrollView'`. If more elements match the default selector, then by default it will pick the first matching element. <br /> <strong>MOBILE-NATIVE-APP-ONLY</strong>
 * @uses protocol/execute
 * @type utility
 *
 */
export async function scrollIntoView (
    this: WebdriverIO.Element,
    options: CustomScrollIntoViewOptions | boolean = { block: 'start', inline: 'nearest' }
): Promise<void|unknown> {
    const browser = getBrowserObject(this)

    /**
     * Appium does not support the "wheel" action
     */
    if (browser.isMobile) {
        if (await browser.getContext() === 'NATIVE_APP') {
            return nativeMobileScrollIntoView({
                browser,
                element: this,
                options: (options as CustomScrollIntoViewOptions) || {}
            })
        }

        return scrollIntoViewWeb.call(this, options)
    }

    try {
        /**
         * by default the WebDriver action scrolls the element just into the
         * viewport. In order to stay complaint with `Element.scrollIntoView()`
         * we need to adjust the values a bit.
         */
        const elemRect = await browser.getElementRect(this.elementId)
        const viewport = await browser.getWindowSize()
        let [scrollX, scrollY] = await browser.execute(() => [
            window.scrollX, window.scrollY
        ])

        // handle elements outside of the viewport
        scrollX = elemRect.x <= viewport.width ? elemRect.x : viewport.width / 2
        scrollY = elemRect.y <= viewport.height ? elemRect.y : viewport.height / 2

        const deltaByOption = {
            start: { y: elemRect.y - elemRect.height, x: elemRect.x - elemRect.width },
            center: { y: elemRect.y - Math.round((viewport.height - elemRect.height) / 2), x: elemRect.x - Math.round((viewport.width - elemRect.width) / 2) },
            end: { y: elemRect.y - (viewport.height - elemRect.height), x: elemRect.x - (viewport.width - elemRect.width) }
        }

        let [deltaX, deltaY] = [deltaByOption.start.x, deltaByOption.start.y]
        if (options === true) {
            options = { block: 'start', inline: 'nearest' }
        }
        if (options === false) {
            options = { block: 'end', inline: 'nearest' }
        }
        if (options && typeof options === 'object') {
            const { block, inline } = options
            if (block === 'nearest') {
                const nearestYDistance = Math.min(...Object.values(deltaByOption).map(delta => delta.y))
                deltaY = Object.values(deltaByOption).find(delta => delta.y === nearestYDistance)!.y
            } else if (block) {
                deltaY = deltaByOption[block].y
            }
            if (inline === 'nearest') {
                const nearestXDistance = Math.min(...Object.values(deltaByOption).map(delta => delta.x))
                deltaX = Object.values(deltaByOption).find(delta => delta.x === nearestXDistance)!.x
            } else if (inline) {
                deltaX = deltaByOption[inline].x
            }
        }

        // take into account the current scroll position
        deltaX = Math.round(deltaX - scrollX)
        deltaY = Math.round(deltaY - scrollY)

        await browser.action('wheel')
            .scroll({ duration: 0, x: deltaX, y: deltaY, origin: this })
            .perform()
    } catch (err: any) {
        log.warn(
            `Failed to execute "scrollIntoView" using WebDriver Actions API: ${err.message}!\n` +
            'Re-attempting using `Element.scrollIntoView` via Web API.'
        )
        await scrollIntoViewWeb.call(this, options)
    }
}

type MobileScrollUntilVisibleOptions = {
    browser: WebdriverIO.Browser;
    element: WebdriverIO.Element;
    maxScrolls: number;
    scrollDirection: MobileScrollDirection;
    scrollableElement: WebdriverIO.Element | null;
};

async function getScrollableElement({
    browser,
    options
}: {
    browser: WebdriverIO.Browser,
    options?: MobileScrollIntoViewOptions
    }): Promise<WebdriverIO.Element | null> {
    if (options?.scrollableElement) {
        return options?.scrollableElement
    }
    const defaultAndroidSelector = '//android.widget.ScrollView'
    const defaultIosSelector = '-ios predicate string:type == "XCUIElementTypeApplication"'
    const selector = browser.isIOS
        ? // For iOS, we need to find the application element, if we can't find it, we should throw an error
        defaultIosSelector
        : // There is always a scrollview for Android or, if this fails we should throw an error
        defaultAndroidSelector
    // Not sure why we need to do this, but it seems to be necessary
    const scrollableElements = (await browser.$$(
        selector
    )) as unknown as WebdriverIO.Element[]

    if (scrollableElements.length > 0) {
        return scrollableElements[0]
    }

    throw new Error(
        `Default scrollable element '${browser.isIOS ? defaultIosSelector : defaultAndroidSelector}' was not found. Our advice is to provide a scrollable element like this:

        await elem.scrollIntoView({ scrollableElement: $('#scrollable') });

        `
    )
}

async function mobileScrollUntilVisible({
    browser,
    element,
    scrollableElement,
    maxScrolls,
    scrollDirection,
}: MobileScrollUntilVisibleOptions): Promise<{ hasScrolled: boolean; isVisible: boolean;  }> {
    let isVisible = false
    let hasScrolled = false
    let scrolls = 0

    while (!isVisible && scrolls < maxScrolls) {
        try {
            isVisible = await element.isDisplayed()
        } catch {
            isVisible = false
        }

        if (isVisible) {break}

        if (browser.isIOS) {
            await browser.execute('mobile: scroll', {
                elementId: (await scrollableElement)?.elementId,
                direction: scrollDirection,
            })
            hasScrolled = true
        } else {
            await browser.execute('mobile: scrollGesture', {
                elementId: (await scrollableElement)?.elementId,
                direction: scrollDirection,
                percent: 0.5,
            })
            hasScrolled = true
        }

        scrolls++
    }

    return { hasScrolled, isVisible }
}

async function nativeMobileScrollIntoView({
    browser,
    element,
    options
}: {
    browser: WebdriverIO.Browser,
    element: WebdriverIO.Element,
    options: MobileScrollIntoViewOptions
    }) {
    const defaultOptions = {
        maxScrolls: 10,
        scrollDirection: MobileScrollDirection.Down,
    }
    const mobileOptions = {
        ...defaultOptions,
        ...(options || {}),
    }
    const scrollableElement = await getScrollableElement({ browser, options: mobileOptions })
    const { hasScrolled, isVisible } = await mobileScrollUntilVisible({
        browser,
        element,
        maxScrolls: mobileOptions.maxScrolls,
        scrollDirection: mobileOptions.scrollDirection,
        scrollableElement,
    })

    if (hasScrolled && isVisible) {
        // Pause for stabilization
        return browser.pause(1000)
    } else if (isVisible) {
        // Element is already visible
        return
    }

    throw new Error(`Element not found within scroll limit of ${mobileOptions.maxScrolls} scrolls by scrolling "${mobileOptions.scrollDirection}". ` +
        `Are you sure the element is within the scrollable element or the direction is correct? You can change the scrollable element or direction like this:

        await elem.scrollIntoView({
            direction: 'left' // posible options are: 'up|down|left|right'
            scrollableElement: $('#scrollable'),
        });

        `)
}

function scrollIntoViewWeb (
    this: WebdriverIO.Element,
    options: ScrollIntoViewOptions | boolean = { block: 'start', inline: 'nearest' }
) {
    const browser = getBrowserObject(this)
    return browser.execute(
        (elem: HTMLElement, options: ScrollIntoViewOptions | boolean) => elem.scrollIntoView(options),
        {
            [ELEMENT_KEY]: this.elementId, // w3c compatible
            ELEMENT: this.elementId, // jsonwp compatible
        } as any as HTMLElement,
        options,
    )
}
