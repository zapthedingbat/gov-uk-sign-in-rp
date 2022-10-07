import { By, ThenableWebDriver as Driver, WebElement } from "selenium-webdriver"
import { findWebElement } from "../web-elements";

export abstract class PageBase {
  protected constructor(
    protected driver: Driver
  ) {
    
  }

  public async navigateTo(url: string): Promise<void>{
    await this.driver.navigate().to(url);
  }

  protected findRadioButton(name: string, value: string){
    return this.driver.findElement(By.css(`input[type='radio'][name='${name}'][value='${value}']`));
  }

  protected findInput(name: string){
    return this.driver.findElement(By.css(`input[name='${name}']`));
  }

  public async authenticate(username: string, password: string): Promise<void> {
    const url = new URL(await this.driver.getCurrentUrl());
    url.username = username;
    url.password = password;
    await this.driver.navigate().to(url.toString());
  }

  async getUrl(): Promise<string> {
    return await this.driver.getCurrentUrl();
  }

  async clickOn(selector: string) {
    const element = await this.driver.findElement(By.css(selector));
    await element.click();
  }

  async inputText(selector: string, value: string) {
    const element = await this.driver.findElement(By.css(selector));
    await element.click();
    await element.sendKeys(value);
  }

  async selectOption(selector: string, value: string) {
    const selectElement = await this.driver.findElement(By.css(selector));
    const options = await selectElement.findElements(By.css("option"));
    const option = await findWebElement(options, async (option) => {
      const optionValue = await option.getAttribute("value");
      return optionValue === value;
    });

    if (option instanceof WebElement) {
      await option.click();
    }
  }

}