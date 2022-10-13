import { By, ThenableWebDriver, until, WebElement,WebElementCondition } from "selenium-webdriver";
import { findWebElement } from "../web-elements";
import { PageBase } from "./PageBase";

export class GovUkOneLoginPage extends PageBase {


  constructor(driver: ThenableWebDriver) {
    super(driver);
  }
  
  async rejectCookies(){
    const cookiesRejectButtonSelector = "button[name='cookiesReject']";
    if(await this.isVisible(cookiesRejectButtonSelector)){
      await this.clickOn(cookiesRejectButtonSelector);
      await this.clickOn("#cookies-rejected a.cookie-hide-button");
    }
  }

  async answerKbvQuestion(answers: { [questionId: string]: number | string }) {
    const fieldset = await this.driver.findElement(
      By.css("form[action='/kbv/question'] fieldset.govuk-fieldset")
    );
    const fieldsetId = await fieldset.getAttribute("id");
    const questionId = fieldsetId.replace(/\-.+$/, "");
    const answer = answers[questionId];
    const answerRadios = await fieldset.findElements(By.name(questionId));

    // Find the radio input that matches the answer
    let answerRadio = await findWebElement(
      answerRadios,
      async (radio: WebElement) => {
        const value = await radio.getAttribute("value");
        
        // Exact match
        if (value.replace(/^\s*|\s*$|£/gi, "") === answer.toString()) {
          return true;
        }

        // Range
        if (typeof answer === "number") {
          const match = /^(?:OVER £?([\d,]+) )?UP TO £?([\d,]+)$/.exec(value);
          if (match !== null) {
            const min = Number.parseFloat((match[1] || "0").replace(/,/ig, ""));
            const max = Number.parseFloat(match[2].replace(/,/ig, ""));
            if (answer <= max && answer >= min) {
              return true;
            }
          }
        }
        return false;
      }
    );
    if (answerRadio instanceof WebElement) {
      await answerRadio.click();
      return;
    }

    answerRadio = await findWebElement(answerRadios, async (radio: WebElement) => {
      const value = await radio.getAttribute("value");
      return value.startsWith("NONE OF THE ABOVE");
    });
    if (answerRadio instanceof WebElement) {
      await answerRadio.click();
      return
    }


  }

  async waitToLeaveIpvCallback() {
    await this.driver.wait(async (driver) => {
      return (await driver.getCurrentUrl()).endsWith("/ipv-callback") === false
    });
  }
}
